import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class IntervalScheduler: Scheduler {
    private var armed: [Int: TimeInterval] = [:]
    private var nextId = 0

    var intervals: [TimeInterval] {
        armed.values.sorted()
    }

    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = nextId
        nextId += 1
        armed[id] = interval
        return { [weak self] in self?.armed[id] = nil }
    }
}

private struct Turn {
    let minutesAgo: Double
    let input: Int
    let output: Int
    var model = "gpt-5.6-sol"
    var limits: Double?
}

private func rollout(_ session: String, _ turns: [Turn], now: Date = Date()) -> String {
    let iso = { (minutesAgo: Double) in now.addingTimeInterval(-minutesAgo * 60).ISO8601Format() }
    let first = turns.map(\.minutesAgo).max() ?? 0
    var total = 0
    var lines = [#"{"timestamp":"\#(iso(first))","type":"session_meta","payload":{"id":"\#(session)","cwd":"/home/u/frodo"}}"#]
    for turn in turns {
        total += turn.input + turn.output
        lines.append(#"{"timestamp":"\#(iso(turn.minutesAgo))","type":"turn_context","payload":{"model":"\#(turn.model)"}}"#)
        let last = #"{"input_tokens":\#(turn.input),"cached_input_tokens":0,"output_tokens":\#(turn.output),"total_tokens":\#(turn.input + turn.output)}"#
        let limits = turn.limits.map {
            #"{"primary":{"used_percent":\#($0),"window_minutes":300,"resets_at":\#(Int(now.timeIntervalSince1970) + 3600)},"plan_type":"plus"}"#
        } ?? "null"
        lines.append(
            #"{"timestamp":"\#(iso(turn.minutesAgo))","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":\#(total)},"last_token_usage":\#(last),"model_context_window":1000},"rate_limits":\#(limits)}}"#
        )
    }
    return lines.joined(separator: "\n")
}

@MainActor
private struct Harness {
    let root = NSTemporaryDirectory() + "frodo-codex-\(UUID().uuidString)"
    let settings: FrodoSettings
    let scheduler = IntervalScheduler()
    let service: CodexService

    init(enabled: Bool = false, home: String? = nil) {
        let suite = "frodo-codex-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        settings = FrodoSettings(defaults: defaults)
        if !enabled { settings.disabledAi = [.codex] }
        service = CodexService(settings: settings, home: home ?? root, scheduler: scheduler)
    }

    func write(_ relative: String, _ text: String, modified: Date? = nil) throws {
        let path = "\(root)/\(relative)"
        try FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
        try text.write(toFile: path, atomically: false, encoding: .utf8)
        if let modified { try FileManager.default.setAttributes([.modificationDate: modified], ofItemAtPath: path) }
    }

    func remove(_ relative: String) throws {
        try FileManager.default.removeItem(atPath: "\(root)/\(relative)")
    }

    func cleanup() {
        service.destroy()
        try? FileManager.default.removeItem(atPath: root)
    }
}

private func todayDir(_ now: Date = Date()) -> String {
    let parts = Calendar.current.dateComponents([.year, .month, .day], from: now)
    return String(format: "sessions/%04d/%02d/%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

@MainActor
@Suite("CodexService")
struct CodexServiceTests {
    @Test("sem a pasta de sessões fica indisponível e sem limites")
    func withoutSessionsIsUnavailable() async {
        let harness = Harness()
        defer { harness.cleanup() }
        await harness.service.refresh()
        #expect(!harness.service.available)
        #expect(harness.service.limits == nil)
        #expect(harness.service.lastRefresh != nil)
        #expect(harness.service.emptyMessage == "Codex não encontrado em ~/.codex")
    }

    @Test("um rollout de hoje dá medidores e consumo do dia")
    func todayRolloutGivesMetersAndSummary() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("\(todayDir())/rollout-a.jsonl", rollout("a", [Turn(minutesAgo: 0, input: 10, output: 1, limits: 30)]))
        await harness.service.refresh()
        let meters = harness.service.meters(now: Date())
        #expect(meters.map(\.key) == ["session"])
        #expect(meters.first?.percent == 30)
        #expect(harness.service.plan == "Plus")
        #expect(harness.service.emptyMessage == nil)
        await harness.service.scan()
        let summary = harness.service.summary(.today)
        #expect(summary.input == 10)
        #expect(summary.output == 1)
        #expect(summary.sessions == 1)
    }

    @Test("lê os limites do rollout mais novo que tem limites, até três pastas de fundo")
    func readsNewestLimitsUpToThreeLevels() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let now = Date()
        let day = "sessions/2026/10/27"
        try harness.write("\(day)/rollout-a.jsonl", rollout("a", [Turn(minutesAgo: 5, input: 10, output: 1, limits: 12)]), modified: now - 600)
        try harness.write("\(day)/rollout-b.jsonl", rollout("b", [Turn(minutesAgo: 5, input: 10, output: 1, limits: 44)]), modified: now - 300)
        try harness.write("\(day)/rollout-c.jsonl", rollout("c", [Turn(minutesAgo: 1, input: 10, output: 1)]), modified: now)
        try harness.write("\(day)/notas.jsonl", rollout("d", [Turn(minutesAgo: 1, input: 10, output: 1, limits: 99)]), modified: now)
        try harness.write("\(day)/x/rollout-e.jsonl", rollout("e", [Turn(minutesAgo: 1, input: 1, output: 1, limits: 77)]), modified: now)
        await harness.service.refresh()
        #expect(harness.service.available)
        #expect(harness.service.limits?.primary?.usedPercent == 44)
        #expect(harness.service.limits?.plan == "plus")
    }

    @Test("não troca os limites por outros mais velhos lidos depois")
    func keepsNewerLimits() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let now = Date()
        try harness.write("sessions/rollout-a.jsonl", rollout("a", [Turn(minutesAgo: 1, input: 10, output: 1, limits: 50)]), modified: now - 600)
        await harness.service.refresh()
        try harness.write("sessions/rollout-b.jsonl", rollout("b", [Turn(minutesAgo: 30, input: 10, output: 1, limits: 5)]), modified: now)
        await harness.service.refresh()
        #expect(harness.service.limits?.primary?.usedPercent == 50)
        try harness.write("sessions/rollout-c.jsonl", rollout("c", [Turn(minutesAgo: 0, input: 10, output: 1, limits: 70)]), modified: now + 60)
        await harness.service.refresh()
        #expect(harness.service.limits?.primary?.usedPercent == 70)
    }

    @Test("scan soma o consumo dos rollouts dos últimos 30 dias")
    func scanSumsLastThirtyDays() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let now = Date()
        try harness.write("sessions/rollout-a.jsonl", rollout("s", [Turn(minutesAgo: 20, input: 100, output: 10)]), modified: now - 600)
        try harness.write(
            "sessions/rollout-b.jsonl", rollout("s", [Turn(minutesAgo: 5, input: 200, output: 20, model: "gpt-5.1-codex-mini", limits: 60)]), modified: now
        )
        try harness.write("sessions/rollout-velho.jsonl", rollout("v", [Turn(minutesAgo: 2, input: 5000, output: 0)]), modified: now - 40 * 24 * 3600)
        await harness.service.scan()
        #expect(!harness.service.scanning)
        let summary = harness.service.summary(.week)
        #expect(summary.input == 300)
        #expect(summary.output == 30)
        #expect(summary.sessions == 1)
        #expect(harness.service.limits?.primary?.usedPercent == 60)
    }

    @Test("scan esquece o rollout apagado")
    func scanForgetsDeletedRollout() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("sessions/rollout-a.jsonl", rollout("a", [Turn(minutesAgo: 5, input: 100, output: 10)]))
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 110)
        try harness.remove("sessions/rollout-a.jsonl")
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 0)
    }

    @Test("scan lê só o que o rollout ganhou e espera a linha incompleta terminar")
    func scanReadsOnlyAppendedCompleteLines() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let first = rollout("a", [Turn(minutesAgo: 5, input: 100, output: 10)])
        let second = Array(rollout("a", [Turn(minutesAgo: 1, input: 50, output: 5)]).split(separator: "\n").dropFirst().map(String.init))
        try harness.write("sessions/rollout-a.jsonl", first, modified: Date() - 60)
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 110)
        try harness.write("sessions/rollout-a.jsonl", "\(first)\n\(second[0])\n\(second[1].dropLast(10))")
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 110)
        try harness.write("sessions/rollout-a.jsonl", "\(first)\n\(second.joined(separator: "\n"))")
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 165)
    }

    @Test("scan relê o rollout que encolheu")
    func scanRereadsShrunkRollout() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let turns = [Turn(minutesAgo: 5, input: 100, output: 10), Turn(minutesAgo: 1, input: 50, output: 5)]
        try harness.write("sessions/rollout-a.jsonl", rollout("a", turns), modified: Date() - 60)
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 165)
        try harness.write("sessions/rollout-a.jsonl", rollout("a", [Turn(minutesAgo: 5, input: 7, output: 3)]))
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 10)
    }

    @Test("provedor desligado não agenda timer; ligado agenda a cota e o consumo só quando querem")
    func disabledProviderSchedulesNothing() {
        let harness = Harness()
        defer { harness.cleanup() }
        #expect(harness.scheduler.intervals.isEmpty)
        harness.settings.claudePollMinutes = 5
        harness.settings.disabledAi = []
        #expect(harness.scheduler.intervals == [300])
        harness.service.setWanted(true)
        #expect(harness.scheduler.intervals == [30, 300])
        harness.service.setWanted(false)
        harness.settings.disabledAi = [.codex]
        #expect(harness.scheduler.intervals.isEmpty)
    }
}
