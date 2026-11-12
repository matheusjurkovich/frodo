import FrodoCore
import Foundation

private let scanSeconds: TimeInterval = 30
private let staleSeconds: TimeInterval = 60

private func isSessionFile(_ entry: FileEntry, since: Date) -> Bool {
    entry.isRegular && (entry.name.hasSuffix(".json") || entry.name.hasSuffix(".jsonl")) && entry.modified >= since
}

private actor GeminiReader {
    private struct Found {
        let entry: FileEntry
        let project: String
        let parent: String?
    }

    private struct Loaded {
        let key: String
        let modified: Date
        let offset: Int
        let parser: GeminiSessionParser?
        let id: String
        let project: String
        let session: String
        let requests: [GeminiRequest]
    }

    private let root: String
    private var files: [String: Loaded] = [:]

    init(root: String) {
        self.root = root
    }

    private var tmpDir: String {
        "\(root)/tmp"
    }

    func load(since: Date, prune: Bool, now: Date) -> (available: Bool, cells: [UsageCell], times: [Date]) {
        let available = directoryExists(tmpDir)
        let (found, complete) = list(since: since)
        for file in found where !Task.isCancelled {
            if let loaded = read(file, known: files[file.entry.path]) { files[file.entry.path] = loaded }
        }
        let oldest = consumptionStart(now)
        let paths = Set(found.map(\.entry.path))
        files = files.filter { path, loaded in loaded.modified >= oldest && !(prune && complete && !paths.contains(path)) }
        var seen: Set<String> = []
        var cells: [UsageCell] = []
        var times: [Date] = []
        for path in files.keys.sorted() {
            guard let loaded = files[path] else { continue }
            let fresh = loaded.requests.filter { seen.insert("\(loaded.id):\($0.id)").inserted }
            times += fresh.map(\.at)
            cells += geminiCells(fresh, project: loaded.project, session: loaded.session)
        }
        return (available, cells, times)
    }

    private func read(_ file: Found, known: Loaded?) -> Loaded? {
        let entry = file.entry
        if known?.key == entry.key { return nil }
        if !entry.name.hasSuffix(".jsonl") {
            guard let data = readRange(entry.path, from: 0, count: entry.size),
                let parsed = parseGeminiSession(String(decoding: data, as: UTF8.self))
            else { return nil }
            return loaded(file, offset: 0, parser: nil, session: parsed)
        }
        let resumed = known.flatMap { $0.parser != nil && $0.offset <= entry.size ? $0 : nil }
        let parser = resumed?.parser ?? GeminiSessionParser()
        let start = resumed?.offset ?? 0
        guard let data = readRange(entry.path, from: start, count: entry.size - start) else { return nil }
        let offset = start + consumeLines(data, into: parser)
        guard let parsed = parser.result() else { return nil }
        return loaded(file, offset: offset, parser: parser, session: parsed)
    }

    private func loaded(_ file: Found, offset: Int, parser: GeminiSessionParser?, session: GeminiSession) -> Loaded {
        Loaded(
            key: file.entry.key, modified: file.entry.modified, offset: offset, parser: parser, id: session.id, project: file.project,
            session: file.parent ?? session.id, requests: session.requests
        )
    }

    private func projectNames() -> [String: String] {
        let path = "\(root)/projects.json"
        let text = (try? Data(contentsOf: URL(fileURLWithPath: path))).map { String(decoding: $0, as: UTF8.self) }
        var byHash: [String: String] = [:]
        for (dir, name) in parseProjects(text) { byHash[sha256Hex(dir)] = name }
        return byHash
    }

    private func list(since: Date) -> (found: [Found], complete: Bool) {
        let names = projectNames()
        var found: [Found] = []
        var complete = true
        func children(_ dir: String) -> [FileEntry] {
            guard let entries = listEntries(dir) else {
                complete = false
                return []
            }
            return entries
        }
        for projectDir in children(tmpDir) where projectDir.isDirectory {
            let project = projectName(projectDir.name, namesByHash: names)
            for entry in children("\(projectDir.path)/chats") {
                if isSessionFile(entry, since: since) { found.append(Found(entry: entry, project: project, parent: nil)) }
                guard entry.isDirectory else { continue }
                for sub in children(entry.path) where isSessionFile(sub, since: since) {
                    found.append(Found(entry: sub, project: project, parent: entry.name))
                }
            }
        }
        return (found, complete)
    }
}

@MainActor
public final class GeminiService: MeterSource, ConsumptionSource, Destroyable {
    public let changed = Event<Void>()
    public private(set) var available: Bool
    public private(set) var scanning = false
    public private(set) var lastRefresh: Date?

    private let settings: FrodoSettings
    private let now: @MainActor () -> Date
    private let reader: GeminiReader
    private let pollTimer: TimerSlot
    private let scanTimer: TimerSlot
    private let disposables = Disposables()
    private var times: [Date]?
    private var cells: [UsageCell] = [] {
        didSet { summaries = [:] }
    }
    private var summaries: [Period: ConsumptionSummary] = [:]
    private var wanted = 0
    private var refreshing: Task<Void, Never>?
    private var scanTask: Task<Void, Never>?
    private var destroyed = false

    public init(settings: FrodoSettings, home: String, scheduler: Scheduler, now: @escaping @MainActor () -> Date = { Date() }) {
        self.settings = settings
        self.now = now
        available = directoryExists("\(home)/tmp")
        reader = GeminiReader(root: home)
        pollTimer = TimerSlot(scheduler: scheduler)
        scanTimer = TimerSlot(scheduler: scheduler)
        disposables.add(settings.onChanged(["disabled-ai", "claude-poll-minutes"]) { [weak self] in self?.schedule() })
        disposables.add(settings.onChanged(["gemini-daily-limit"]) { [weak self] in self?.changed.emit() })
        schedule()
    }

    public var dailyLimit: Int {
        settings.geminiDailyLimit
    }

    public var plan: String? {
        geminiPlanLabel(dailyLimit)
    }

    public var emptyMessage: String? {
        guard meters(now: now()).isEmpty else { return nil }
        return available ? "Lendo o histórico do Gemini CLI…" : "Gemini CLI não encontrado em ~/.gemini"
    }

    public func quota(now: Date) -> GeminiQuota? {
        guard available, let times else { return nil }
        return geminiQuota(times, limit: dailyLimit, now: now)
    }

    public func meters(now: Date) -> [Meter] {
        geminiMeters(quota(now: now))
    }

    public func summary(_ period: Period) -> ConsumptionSummary {
        if let cached = summaries[period] { return cached }
        let made = summarize(cells, period: period, now: now(), groups: geminiModels)
        summaries[period] = made
        return made
    }

    public func refreshIfStale(maxAge: TimeInterval) {
        guard lastRefresh.map({ now().timeIntervalSince($0) >= maxAge }) ?? true else { return }
        Task { await refresh() }
    }

    public func refresh() async {
        if let refreshing {
            await refreshing.value
            return
        }
        lastRefresh = now()
        let task = Task { await load(since: pacificDayStart(now()), prune: false) }
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
        lastRefresh = now()
        scanning = true
        changed.emit()
        let task = Task { await load(since: consumptionStart(now()), prune: true) }
        scanTask = task
        await task.value
        scanTask = nil
        scanning = false
        if !destroyed { changed.emit() }
    }

    private func load(since: Date, prune: Bool) async {
        let result = await reader.load(since: since, prune: prune, now: now())
        if destroyed { return }
        available = result.available
        cells = result.cells
        times = result.times
    }

    private func schedule() {
        guard settings.providerEnabled(.gemini) else {
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
