import FrodoCore
import Foundation

private let sweepSeconds: TimeInterval = 60
private let hookScriptName = "claude-session.sh"

@MainActor
public final class ClaudeSessions: Destroyable, SessionsSource {
    public let changed = Event<Void>()
    public let hookEvents = Event<HookEvent>()

    private let settings: FrodoSettings
    private let paths: FrodoPaths
    private let runner: CommandRunner
    private let isAlive: (Int) -> Bool
    private let timer: TimerSlot
    private var states: [String: SessionState] = [:]
    private var stateFiles: [String: Date] = [:]
    private var pendingByKey: [String: PendingRequest] = [:]
    private var pendingFiles: [String: Date] = [:]
    private var sources: [DispatchSourceFileSystemObject] = []
    private var primed = false
    private var destroyed = false
    private var installed = false
    private let ownPid = Int(ProcessInfo.processInfo.processIdentifier)

    public init(
        settings: FrodoSettings, paths: FrodoPaths, scheduler: Scheduler, runner: CommandRunner = ProcessCommandRunner(),
        isAlive: @escaping (Int) -> Bool = processIsAlive
    ) {
        self.settings = settings
        self.paths = paths
        self.runner = runner
        self.isAlive = isAlive
        timer = TimerSlot(scheduler: scheduler)
        for directory in [paths.sessionsDir, paths.pendingDir, paths.decisionsDir] {
            try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        }
        try? "\(ownPid) \(ProcessInfo.processInfo.processName)\n".write(toFile: paths.aliveFile, atomically: true, encoding: .utf8)
        for directory in [paths.sessionsDir, paths.pendingDir] { watch(directory) }
        reload()
        primed = true
        refreshHooksInstalled()
    }

    public var sessions: [SessionState] {
        states.values.filter(alive).sorted { $0.since < $1.since }
    }

    public var pending: [PendingRequest] {
        pendingByKey.values.filter { isAlive($0.pid) }.sorted { $0.since < $1.since }
    }

    public func pendingFor(sessionId: String) -> PendingRequest? {
        oldestPending(pending, sessionId: sessionId)
    }

    @discardableResult
    public func decide(_ request: PendingRequest, _ decision: Decision) -> Bool {
        if !isAlive(request.pid) {
            if pendingByKey.removeValue(forKey: request.key) != nil { notifyChanged() }
            return false
        }
        let target = "\(paths.decisionsDir)/\(request.key).json"
        let temporary = target + ".tmp"
        do {
            try decisionJson(decision).write(toFile: temporary, atomically: false, encoding: .utf8)
            _ = try FileManager.default.replaceItemAt(URL(fileURLWithPath: target), withItemAt: URL(fileURLWithPath: temporary))
        } catch {
            try? FileManager.default.removeItem(atPath: temporary)
            return false
        }
        pendingByKey.removeValue(forKey: request.key)
        notifyChanged()
        return true
    }

    public func focus(_ id: String) -> Bool {
        guard let pid = states[id]?.pid else { return false }
        return activateApplicationOwning(pid: pid)
    }

    public func dismiss(_ id: String) {
        if remove(id) { notifyChanged() }
    }

    public func canOpenPullRequest() -> Bool {
        findProgram("gh") != nil
    }

    public func openPullRequest(_ id: String) {
        guard let cwd = states[id]?.cwd, let gh = findProgram("gh") else { return }
        let runner = runner
        Task { _ = await runner.run(gh, arguments: ["pr", "view", "--web"], currentDirectory: cwd) }
    }

    public func diffStat(_ id: String) async -> DiffStat? {
        guard let cwd = states[id]?.cwd, let git = findProgram("git") else { return nil }
        guard let result = await runner.run(git, arguments: ["diff", "--shortstat", "HEAD"], currentDirectory: cwd), result.status == 0 else { return nil }
        return parseShortstat(result.output)
    }

    public func hooksInstalled() -> Bool {
        installed
    }

    public func refreshHooksInstalled() {
        let found = settings.claudeProfiles.contains { profile in
            (try? String(contentsOfFile: "\(profile.configDir)/settings.json", encoding: .utf8))?.contains(hookScriptName) ?? false
        }
        if found != installed {
            installed = found
            notifyChanged()
        }
    }

    public func reload() {
        var didChange = reloadSessions()
        didChange = reloadPending() || didChange
        if didChange { notifyChanged() }
    }

    private func alive(_ state: SessionState) -> Bool {
        state.pid.map(isAlive) ?? true
    }

    private func watch(_ directory: String) {
        let descriptor = open(directory, O_EVTONLY)
        guard descriptor >= 0 else { return }
        let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: descriptor, eventMask: [.write, .rename, .delete, .link], queue: .main)
        source.setEventHandler { [weak self] in
            MainActor.assumeIsolated { self?.reload() }
        }
        source.setCancelHandler { close(descriptor) }
        source.resume()
        sources.append(source)
    }

    private func listJSON(_ directory: String) -> [String: Date] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory)) ?? []
        var files: [String: Date] = [:]
        for name in names where name.hasSuffix(".json") && name.count > 5 {
            let attributes = try? FileManager.default.attributesOfItem(atPath: "\(directory)/\(name)")
            files[name] = (attributes?[.modificationDate] as? Date) ?? Date()
        }
        return files
    }

    private func reloadSessions() -> Bool {
        let files = listJSON(paths.sessionsDir)
        var didChange = false
        for (name, modified) in files where stateFiles[name] != modified {
            stateFiles[name] = modified
            didChange = readSession(name: name, modified: modified) || didChange
        }
        for name in stateFiles.keys where files[name] == nil {
            stateFiles[name] = nil
            didChange = (states.removeValue(forKey: String(name.dropLast(5))) != nil) || didChange
        }
        return didChange
    }

    private func readSession(name: String, modified: Date) -> Bool {
        let id = String(name.dropLast(5))
        guard let text = try? String(contentsOfFile: "\(paths.sessionsDir)/\(name)", encoding: .utf8), let event = parseHookEvent(text), event.sessionId == id
        else { return false }
        let previous = states[id]
        guard let next = nextState(previous: previous, event: event, at: modified), next.pid.map(isAlive) ?? true else { return remove(id) }
        states[id] = next
        if primed { hookEvents.emit(event) }
        guard let previous else { return true }
        return SessionState(
            sessionId: previous.sessionId, cwd: previous.cwd, repo: previous.repo, status: previous.status, tool: previous.tool, step: previous.step,
            pid: previous.pid, since: previous.since, updatedAt: next.updatedAt
        ) != next
    }

    private func reloadPending() -> Bool {
        let files = listJSON(paths.pendingDir)
        var didChange = false
        for (name, modified) in files where pendingFiles[name] != modified {
            pendingFiles[name] = modified
            guard let text = try? String(contentsOfFile: "\(paths.pendingDir)/\(name)", encoding: .utf8),
                let request = parsePending(fileName: name, text: text), isAlive(request.pid)
            else { continue }
            didChange = (pendingByKey[request.key] != request) || didChange
            pendingByKey[request.key] = request
        }
        for name in pendingFiles.keys where files[name] == nil {
            pendingFiles[name] = nil
            didChange = (pendingByKey.removeValue(forKey: String(name.dropLast(5))) != nil) || didChange
        }
        return didChange
    }

    private func remove(_ id: String) -> Bool {
        try? FileManager.default.removeItem(atPath: "\(paths.sessionsDir)/\(id).json")
        stateFiles["\(id).json"] = nil
        return states.removeValue(forKey: id) != nil
    }

    private func sweep() {
        var removed = false
        for state in states.values where !alive(state) { removed = remove(state.sessionId) || removed }
        for request in pendingByKey.values where !isAlive(request.pid) { removed = (pendingByKey.removeValue(forKey: request.key) != nil) || removed }
        if removed { notifyChanged() }
    }

    private func notifyChanged() {
        if destroyed { return }
        let busy = !pendingByKey.isEmpty || states.values.contains { $0.status == .working || $0.status == .waiting }
        if !busy {
            timer.stop()
        } else if !timer.active {
            timer.every(sweepSeconds) { [weak self] in self?.sweep() }
        }
        changed.emit()
    }

    public func destroy() {
        destroyed = true
        timer.stop()
        for source in sources { source.cancel() }
        sources = []
        if let text = try? String(contentsOfFile: paths.aliveFile, encoding: .utf8), text.hasPrefix("\(ownPid) ") {
            try? FileManager.default.removeItem(atPath: paths.aliveFile)
        }
        changed.clearListeners()
        hookEvents.clearListeners()
    }
}
