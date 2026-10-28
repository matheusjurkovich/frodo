import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class StubScheduler: Scheduler {
    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe { {} }
}

private func sessionJSON(id: String, event: String, extra: String = "", pid: Int = 4242) -> String {
    #"{"pid":\#(pid),"event":{"session_id":"\#(id)","cwd":"/r/loja","hook_event_name":"\#(event)"\#(extra)}}"#
}

@MainActor
private struct Harness {
    let root = NSTemporaryDirectory() + "frodo-run-\(UUID().uuidString)"
    let paths: FrodoPaths
    let service: ClaudeSessions

    init(alivePids: Set<Int> = [4242]) {
        let paths = FrodoPaths(home: root, runtimeDir: root, cacheDir: root + "/cache", supportDir: root + "/support")
        self.paths = paths
        let suite = "frodo-sessions-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        service = ClaudeSessions(settings: FrodoSettings(defaults: defaults), paths: paths, scheduler: StubScheduler(), isAlive: { alivePids.contains($0) })
    }

    func writeSession(_ id: String, _ text: String) throws {
        let target = "\(paths.sessionsDir)/\(id).json"
        try text.write(toFile: target + ".tmp", atomically: false, encoding: .utf8)
        _ = try? FileManager.default.replaceItemAt(URL(fileURLWithPath: target), withItemAt: URL(fileURLWithPath: target + ".tmp"))
        if !FileManager.default.fileExists(atPath: target) { try FileManager.default.moveItem(atPath: target + ".tmp", toPath: target) }
    }

    func writePending(_ name: String, _ text: String) throws {
        try text.write(toFile: "\(paths.pendingDir)/\(name)", atomically: true, encoding: .utf8)
    }

    func waitUntil(_ condition: () -> Bool) async {
        for _ in 0 ..< 300 where !condition() {
            service.reload()
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    func cleanup() {
        service.destroy()
        try? FileManager.default.removeItem(atPath: root)
    }
}

@MainActor
@Suite("ClaudeSessions")
struct ClaudeSessionsServiceTests {
    @Test("grava o arquivo alive com o pid e o nome do processo")
    func writesAliveFileWithPidAndProcessName() throws {
        let harness = Harness()
        defer { harness.cleanup() }
        let text = try String(contentsOfFile: harness.paths.aliveFile, encoding: .utf8)
        #expect(text == "\(ProcessInfo.processInfo.processIdentifier) \(ProcessInfo.processInfo.processName)\n")
    }

    @Test("carrega as sessões que já existiam")
    func loadsSessionsThatAlreadyExisted() throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.writeSession("abc", sessionJSON(id: "abc", event: "PreToolUse", extra: #","tool_name":"Bash","tool_input":{"command":"ls"}"#))
        harness.service.reload()
        #expect(harness.service.sessions.map(\.sessionId) == ["abc"])
        #expect(harness.service.sessions.first?.step == "Bash ls")
        #expect(harness.service.sessions.first?.status == .working)
    }

    @Test("percebe uma sessão nova pela pasta observada")
    func noticesNewSessionThroughWatchedDirectory() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        var changes = 0
        _ = harness.service.changed.on { changes += 1 }
        try harness.writeSession("novo", sessionJSON(id: "novo", event: "UserPromptSubmit"))
        await harness.waitUntil { !harness.service.sessions.isEmpty }
        #expect(harness.service.sessions.first?.step == "Pensando")
        #expect(changes >= 1)
    }

    @Test("sessão cujo processo morreu sai da lista")
    func sessionWhoseProcessDiedLeavesTheList() throws {
        let harness = Harness(alivePids: [])
        defer { harness.cleanup() }
        try harness.writeSession("morta", sessionJSON(id: "morta", event: "PreToolUse", extra: #","tool_name":"Bash""#))
        harness.service.reload()
        #expect(harness.service.sessions.isEmpty)
    }

    @Test("SessionEnd tira a sessão")
    func sessionEndRemovesTheSession() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.writeSession("a", sessionJSON(id: "a", event: "UserPromptSubmit"))
        harness.service.reload()
        #expect(harness.service.sessions.count == 1)
        try await Task.sleep(for: .milliseconds(1100))
        try harness.writeSession("a", sessionJSON(id: "a", event: "SessionEnd"))
        harness.service.reload()
        #expect(harness.service.sessions.isEmpty)
    }

    @Test("entrega só eventos de notificação novos aos ouvintes")
    func deliversOnlyNewNotificationEventsToListeners() async throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.writeSession("a", sessionJSON(id: "a", event: "Notification", extra: #","notification_type":"idle_prompt""#))
        harness.service.reload()
        var names: [String] = []
        _ = harness.service.hookEvents.on { names.append($0.name) }
        try await Task.sleep(for: .milliseconds(1100))
        try harness.writeSession("a", sessionJSON(id: "a", event: "Notification", extra: #","notification_type":"permission_prompt","message":"x""#))
        harness.service.reload()
        #expect(names == ["Notification"])
    }

    @Test("pedido pendente aparece e a decisão é gravada para o hook")
    func pendingRequestAppearsAndDecisionIsWrittenForTheHook() throws {
        let harness = Harness()
        defer { harness.cleanup() }
        try harness.writeSession("abc", sessionJSON(id: "abc", event: "PermissionRequest", extra: #","tool_name":"Bash""#))
        try harness.writePending("abc.r1.json", #"{"pid":4242,"tool":"Bash","since":1700000000000}"#)
        harness.service.reload()
        let request = try #require(harness.service.pending.first)
        #expect(request.key == "abc.r1")
        #expect(harness.service.pendingFor(sessionId: "abc") == request)
        #expect(harness.service.decide(request, .allow))
        let decision = try String(contentsOfFile: "\(harness.paths.decisionsDir)/abc.r1.json", encoding: .utf8)
        #expect(decision == "{\"behavior\":\"allow\"}\n")
        #expect(harness.service.pending.isEmpty)
    }

    @Test("não grava decisão para pedido cujo hook já saiu")
    func doesNotWriteDecisionForRequestWhoseHookIsGone() throws {
        let harness = Harness(alivePids: [])
        defer { harness.cleanup() }
        let request = PendingRequest(key: "abc.r1", sessionId: "abc", request: "r1", pid: 999, tool: "Bash", since: Date())
        #expect(!harness.service.decide(request, .deny))
        #expect(!FileManager.default.fileExists(atPath: "\(harness.paths.decisionsDir)/abc.r1.json"))
    }
}
