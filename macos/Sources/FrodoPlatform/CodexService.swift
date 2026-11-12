import FrodoCore
import Foundation

private let scanSeconds: TimeInterval = 30
private let staleSeconds: TimeInterval = 60
private let tailBytes = 256 * 1024
private let maxDepth = 3

private func isRollout(_ name: String) -> Bool {
    name.hasPrefix("rollout-") && name.hasSuffix(".jsonl")
}

private func newer(_ current: CodexLimits?, _ next: CodexLimits?) -> CodexLimits? {
    guard let current else { return next }
    guard let next, next.at > current.at else { return current }
    return next
}

private actor CodexReader {
    private struct Tail {
        let key: String
        let limits: CodexLimits?
    }

    private struct Tracked {
        let key: String
        let offset: Int
        let parser: RolloutParser
    }

    private let sessionsDir: String
    private var tails: [String: Tail] = [:]
    private var rollouts: [String: Tracked] = [:]

    init(sessionsDir: String) {
        self.sessionsDir = sessionsDir
    }

    func newestLimits() -> (available: Bool, limits: CodexLimits?) {
        var visited: [String: Tail] = [:]
        let found = descend(sessionsDir, depth: 0, visited: &visited)
        if !Task.isCancelled { tails = visited }
        return (directoryExists(sessionsDir), found)
    }

    func scan(since: Date) -> (cells: [UsageCell], limits: CodexLimits?) {
        let (found, complete) = list(since: since)
        for file in found where !Task.isCancelled { load(file) }
        if complete && !Task.isCancelled {
            let paths = Set(found.map(\.path))
            rollouts = rollouts.filter { paths.contains($0.key) }
        }
        let parsers = rollouts.keys.sorted().compactMap { rollouts[$0]?.parser }
        return (parsers.flatMap(\.cells), parsers.reduce(CodexLimits?.none) { newer($0, $1.limits) })
    }

    private func descend(_ dir: String, depth: Int, visited: inout [String: Tail]) -> CodexLimits? {
        let entries = listEntries(dir) ?? []
        if depth < maxDepth {
            for folder in entries.filter(\.isDirectory).sorted(by: { $0.name > $1.name }) {
                if let found = descend(folder.path, depth: depth + 1, visited: &visited) { return found }
            }
        }
        for file in entries.filter({ !$0.isDirectory && isRollout($0.name) }).sorted(by: { $0.modified > $1.modified }) {
            if Task.isCancelled { return nil }
            let limits: CodexLimits?
            if let cached = tails[file.path], cached.key == file.key {
                limits = cached.limits
            } else {
                let offset = max(0, file.size - tailBytes)
                limits = readRange(file.path, from: offset, count: file.size - offset).flatMap { latestLimits(String(decoding: $0, as: UTF8.self)) }
            }
            visited[file.path] = Tail(key: file.key, limits: limits)
            if let limits { return limits }
        }
        return nil
    }

    private func load(_ file: FileEntry) {
        let known = rollouts[file.path]
        if known?.key == file.key { return }
        let resumed = known.flatMap { $0.offset <= file.size ? $0 : nil }
        let parser = resumed?.parser ?? RolloutParser()
        let start = resumed?.offset ?? 0
        guard let data = readRange(file.path, from: start, count: file.size - start) else { return }
        rollouts[file.path] = Tracked(key: file.key, offset: start + consumeLines(data, into: parser), parser: parser)
    }

    private func list(since: Date) -> (found: [FileEntry], complete: Bool) {
        var found: [FileEntry] = []
        var complete = true
        func walk(_ dir: String, _ parts: [String]) {
            guard let entries = listEntries(dir) else {
                complete = false
                return
            }
            for entry in entries {
                if entry.isDirectory {
                    let next = parts + [entry.name]
                    if parts.count < maxDepth && !dayDirEnded(next, since: since) { walk(entry.path, next) }
                    continue
                }
                if entry.modified >= since && isRollout(entry.name) { found.append(entry) }
            }
        }
        walk(sessionsDir, [])
        return (found, complete)
    }
}

@MainActor
public final class CodexService: MeterSource, ConsumptionSource, Destroyable {
    public let changed = Event<Void>()
    public private(set) var available: Bool
    public private(set) var limits: CodexLimits?
    public private(set) var scanning = false
    public private(set) var lastRefresh: Date?

    private let settings: FrodoSettings
    private let reader: CodexReader
    private let pollTimer: TimerSlot
    private let scanTimer: TimerSlot
    private let disposables = Disposables()
    private var cells: [UsageCell] = [] {
        didSet { summaries = [:] }
    }
    private var summaries: [Period: ConsumptionSummary] = [:]
    private var wanted = 0
    private var refreshing: Task<Void, Never>?
    private var scanTask: Task<Void, Never>?
    private var destroyed = false

    public init(settings: FrodoSettings, home: String, scheduler: Scheduler) {
        let sessionsDir = "\(home)/sessions"
        self.settings = settings
        available = directoryExists(sessionsDir)
        reader = CodexReader(sessionsDir: sessionsDir)
        pollTimer = TimerSlot(scheduler: scheduler)
        scanTimer = TimerSlot(scheduler: scheduler)
        disposables.add(settings.onChanged(["disabled-ai", "claude-poll-minutes"]) { [weak self] in self?.schedule() })
        schedule()
    }

    public var plan: String? {
        planLabel(limits?.plan)
    }

    public var emptyMessage: String? {
        guard meters(now: Date()).isEmpty else { return nil }
        return available ? "O Codex ainda não informou a cota. Use-o uma vez." : "Codex não encontrado em ~/.codex"
    }

    public func meters(now: Date) -> [Meter] {
        codexMeters(limits, now: now)
    }

    public func summary(_ period: Period) -> ConsumptionSummary {
        if let cached = summaries[period] { return cached }
        let made = summarize(cells, period: period, now: Date(), groups: codexModels)
        summaries[period] = made
        return made
    }

    public func refreshIfStale(maxAge: TimeInterval) {
        guard lastRefresh.map({ Date().timeIntervalSince($0) >= maxAge }) ?? true else { return }
        Task { await refresh() }
    }

    public func refresh() async {
        if let refreshing {
            await refreshing.value
            return
        }
        lastRefresh = Date()
        let task = Task { [reader] in
            let result = await reader.newestLimits()
            if destroyed { return }
            available = result.available
            limits = newer(limits, result.limits)
        }
        refreshing = task
        await task.value
        refreshing = nil
        if !destroyed { changed.emit() }
    }

    public func setWanted(_ isWanted: Bool) {
        if destroyed { return }
        let before = wanted
        wanted = max(0, before + (isWanted ? 1 : -1))
        if wanted == 0 {
            scanTimer.stop()
            return
        }
        if before > 0 { return }
        scanTimer.every(scanSeconds) { [weak self] in Task { await self?.scan() } }
        Task { await scan() }
    }

    public func scan() async {
        if let scanTask {
            await scanTask.value
            return
        }
        scanning = true
        changed.emit()
        let since = consumptionStart(Date())
        let task = Task { [reader] in
            let result = await reader.scan(since: since)
            if destroyed { return }
            cells = result.cells
            limits = newer(limits, result.limits)
        }
        scanTask = task
        await task.value
        scanTask = nil
        scanning = false
        if !destroyed { changed.emit() }
    }

    private func schedule() {
        guard settings.providerEnabled(.codex) else {
            pollTimer.stop()
            return
        }
        pollTimer.every(TimeInterval(max(1, settings.claudePollMinutes)) * 60) { [weak self] in Task { await self?.refresh() } }
        refreshIfStale(maxAge: staleSeconds)
    }

    public func destroy() {
        destroyed = true
        pollTimer.stop()
        scanTimer.stop()
        refreshing?.cancel()
        scanTask?.cancel()
        disposables.dispose()
        changed.clearListeners()
    }
}
