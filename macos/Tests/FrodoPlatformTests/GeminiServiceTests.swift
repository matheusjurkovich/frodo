import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class CountingScheduler: Scheduler {
    private(set) var armed = 0

    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe {
        armed += 1
        return { [weak self] in self?.armed -= 1 }
    }
}

@MainActor
private final class Clock {
    var shift: TimeInterval = 0

    func now() -> Date {
        Date().addingTimeInterval(shift)
    }
}

@MainActor
private func waitUntil(_ condition: () -> Bool) async {
    for _ in 0 ..< 300 where !condition() {
        try? await Task.sleep(for: .milliseconds(10))
    }
}

private func line(_ id: String, ago: TimeInterval) -> String {
    messages([Ask(id: id, ago: ago)])
}

private struct Ask {
    let id: String
    let ago: TimeInterval
    var input = 100
}

private func messages(_ asks: [Ask]) -> String {
    asks.map { ask in
        let at = Date().addingTimeInterval(-ask.ago).ISO8601Format()
        return #"{"id":"\#(ask.id)","timestamp":"\#(at)","type":"gemini","model":"gemini-3.1-pro-preview","tokens":{"input":\#(ask.input),"output":10,"cached":0,"thoughts":0,"tool":0}}"#
    }.joined(separator: ",")
}

private func session(_ id: String, _ asks: [Ask]) -> String {
    #"{"sessionId":"\#(id)","messages":[\#(messages(asks))]}"#
}

@MainActor
private struct Harness {
    let root = NSTemporaryDirectory() + "frodo-gemini-\(UUID().uuidString)"
    let settings: FrodoSettings
    let scheduler = CountingScheduler()
    let clock = Clock()
    let service: GeminiService

    init() {
        let suite = "frodo-gemini-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        settings = FrodoSettings(defaults: defaults)
        settings.disabledAi = [.gemini]
        service = GeminiService(settings: settings, home: root, scheduler: scheduler, now: { [clock] in clock.now() })
    }

    func write(_ relative: String, _ text: String, modified: Date? = nil) throws {
        let path = "\(root)/\(relative)"
        try FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
        try text.write(toFile: path, atomically: false, encoding: .utf8)
        if let modified { try FileManager.default.setAttributes([.modificationDate: modified], ofItemAtPath: path) }
    }

    func chmod(_ relative: String, _ mode: Int) throws {
        try FileManager.default.setAttributes([.posixPermissions: mode], ofItemAtPath: "\(root)/\(relative)")
    }

    func cleanup() {
        service.destroy()
        try? FileManager.default.removeItem(atPath: root)
    }
}

@MainActor
@Suite("GeminiService")
struct GeminiServiceTests {
    @Test("sem a pasta tmp fica indisponível e sem cota")
    func withoutTmpIsUnavailable() async {
        let harness = Harness()
        defer { harness.cleanup() }
        await harness.service.refresh()
        #expect(!harness.service.available)
        #expect(harness.service.quota(now: Date()) == nil)
        #expect(harness.service.emptyMessage == "Gemini CLI não encontrado em ~/.gemini")
    }

    @Test("só mostra cota depois da primeira leitura")
    func quotaOnlyAfterFirstRead() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/frodo/chats/s1.json", session("s1", [Ask(id: "g1", ago: 10)]))
        let service = GeminiService(settings: harness.settings, home: harness.root, scheduler: harness.scheduler)
        defer { service.destroy() }
        #expect(service.available)
        #expect(service.quota(now: Date()) == nil)
        #expect(service.emptyMessage == "Lendo o histórico do Gemini CLI…")
        await service.refresh()
        #expect(service.quota(now: Date())?.requests == 1)
        #expect(service.meters(now: Date()).map(\.key) == ["daily", "minute"])
    }

    @Test("conta os pedidos de hoje e do último minuto, uma vez cada")
    func countsTodayAndLastMinuteOnce() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let asks = [Ask(id: "g1", ago: 10), Ask(id: "g2", ago: 5 * 60), Ask(id: "g3", ago: 3 * 24 * 3600)]
        try harness.write("tmp/frodo/chats/s1.json", session("s1", asks))
        try harness.write("tmp/frodo/chats/s1/copia.json", session("s1", Array(asks.prefix(1))))
        try harness.write("tmp/frodo/chats/notas.txt", session("s9", [Ask(id: "g9", ago: 1)]))
        await harness.service.refresh()
        let quota = harness.service.quota(now: Date())
        #expect(quota?.requests == 2)
        #expect(quota?.perMinute == 1)
        #expect(quota?.limit == 1000)
    }

    @Test("arquivo sem sessionId é ignorado")
    func fileWithoutSessionIdIsIgnored() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/frodo/chats/s1.json", #"{"messages":[\#(messages([Ask(id: "g1", ago: 10)]))]}"#)
        try harness.write("tmp/frodo/chats/s2.jsonl", #"{"type":"gemini","id":"g2"}"# + "\n")
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 0)
        #expect(harness.service.quota(now: Date())?.requests == 0)
    }

    @Test("trocar o limite diário avisa e muda a cota")
    func changingDailyLimitNotifies() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/frodo/chats/s1.json", session("s1", [Ask(id: "g1", ago: 10)]))
        await harness.service.refresh()
        var changes = 0
        _ = harness.service.changed.on { changes += 1 }
        harness.settings.geminiDailyLimit = 1500
        #expect(changes == 1)
        #expect(harness.service.quota(now: Date())?.limit == 1500)
        #expect(harness.service.plan == "Standard")
    }

    @Test("scan nomeia o projeto pelo projects.json e agrupa subagentes na sessão pai")
    func scanNamesProjectsAndGroupsSubagents() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let frodo = sha256Hex("/home/u/frodo")
        let other = sha256Hex("/home/u/x")
        try harness.write("projects.json", #"{"projects":{"/home/u/frodo":"frodo","/home/u/x":7}}"#)
        try harness.write("tmp/\(frodo)/chats/s1.json", session("s1", [Ask(id: "g1", ago: 60, input: 100)]))
        try harness.write("tmp/\(frodo)/chats/s1/sub.json", session("sub", [Ask(id: "g2", ago: 50, input: 200)]))
        try harness.write("tmp/\(other)/chats/s2.json", session("s2", [Ask(id: "g3", ago: 40, input: 400)]))
        try harness.write("tmp/meu-projeto/chats/s3.json", session("s3", [Ask(id: "g4", ago: 30, input: 800)]))
        try harness.write("tmp/arquivo-solto.json", session("s4", [Ask(id: "g5", ago: 30, input: 1600)]))
        await harness.service.scan()
        let summary = harness.service.summary(.week)
        #expect(summary.input == 1500)
        #expect(summary.sessions == 3)
        #expect(summary.projects.map { "\($0.name):\($0.tokens)" } == ["meu-projeto:810", "outro:410", "frodo:320"])
    }

    @Test("scan ignora arquivo velho e esquece o apagado")
    func scanSkipsOldAndForgetsDeleted() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/p/chats/a.json", session("a", [Ask(id: "g1", ago: 60)]))
        try harness.write("tmp/p/chats/b.json", session("b", [Ask(id: "g2", ago: 60)]), modified: Date() - 40 * 24 * 3600)
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 110)
        try FileManager.default.removeItem(atPath: "\(harness.root)/tmp/p/chats/a.json")
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 0)
    }

    @Test("provedor desligado não agenda timer")
    func disabledProviderSchedulesNothing() {
        let harness = Harness()
        defer { harness.cleanup() }
        #expect(harness.scheduler.armed == 0)
        harness.settings.disabledAi = []
        #expect(harness.scheduler.armed == 1)
        harness.settings.disabledAi = [.gemini, .codex]
        #expect(harness.scheduler.armed == 0)
    }

    @Test("com o provedor ligado atualiza sozinho")
    func enabledProviderRefreshesByItself() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/frodo/chats/s1.json", session("s1", [Ask(id: "g1", ago: 10)]))
        let service = GeminiService(settings: harness.settings, home: harness.root, scheduler: harness.scheduler)
        defer { service.destroy() }
        try await Task.sleep(for: .milliseconds(50))
        #expect(service.lastRefresh == nil)
        harness.settings.disabledAi = []
        await waitUntil { service.quota(now: Date())?.requests == 1 }
        #expect(service.quota(now: Date())?.requests == 1)
    }

    @Test("scan relê o arquivo que mudou")
    func scanRereadsChangedFile() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/p/chats/a.json", session("a", [Ask(id: "g1", ago: 60)]), modified: Date() - 60)
        await harness.service.scan()
        try harness.write("tmp/p/chats/a.json", session("a", [Ask(id: "g1", ago: 60), Ask(id: "g2", ago: 10)]))
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 220)
    }

    @Test("scan lê só o que o JSONL ganhou e espera a linha incompleta terminar")
    func scanReadsOnlyAppendedCompleteJsonlLines() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let head = #"{"sessionId":"a"}"# + "\n" + line("g1", ago: 60) + "\n"
        let second = line("g2", ago: 10)
        try harness.write("tmp/p/chats/a.jsonl", head, modified: Date() - 60)
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 110)
        try harness.write("tmp/p/chats/a.jsonl", head + second.prefix(20))
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 110)
        try harness.write("tmp/p/chats/a.jsonl", head + second + "\n")
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 220)
    }

    @Test("scan com pasta ilegível não esquece o que já leu")
    func scanKeepsWhatItReadWhenFolderIsUnreadable() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/p/chats/a.json", session("a", [Ask(id: "g1", ago: 60)]))
        await harness.service.scan()
        try harness.chmod("tmp/p/chats", 0)
        defer { try? harness.chmod("tmp/p/chats", 0o700) }
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 110)
    }

    @Test("refresh descarta o que saiu da janela de 30 dias")
    func refreshDropsWhatLeftTheWindow() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/p/chats/a.json", session("a", [Ask(id: "g1", ago: 60)]), modified: Date() - 20 * 24 * 3600)
        await harness.service.scan()
        #expect(harness.service.summary(.week).total == 110)
        harness.clock.shift = 11 * 24 * 3600
        await harness.service.refresh()
        harness.clock.shift = 0
        #expect(harness.service.summary(.week).total == 0)
    }

    @Test("refresh e scan ao mesmo tempo terminam com o mesmo resultado")
    func refreshAndScanTogetherAgree() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.write("tmp/p/chats/a.json", session("a", [Ask(id: "g1", ago: 60)]))
        let service = harness.service
        let refreshing = Task { await service.refresh() }
        let scanning = Task { await service.scan() }
        await refreshing.value
        await scanning.value
        #expect(service.summary(.week).total == 110)
        #expect(service.quota(now: Date())?.requests == 1)
    }
}
