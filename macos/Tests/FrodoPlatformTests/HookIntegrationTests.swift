import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class StubScheduler: Scheduler {
    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe { {} }
}

private func hookScript() -> String {
    URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().appendingPathComponent("shared/hooks/claude-session.sh").path
}

private final class HookRun: @unchecked Sendable {
    let process = Process()
    private let output = Pipe()

    init(runtimeDir: String, event: String, waitSeconds: Int = 20) throws {
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [hookScript()]
        var environment = ProcessInfo.processInfo.environment
        environment["FRODO_RUNTIME_DIR"] = runtimeDir
        environment["FRODO_TERMINAL_WAIT_SECONDS"] = String(waitSeconds)
        environment["CLAUDE_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        environment.removeValue(forKey: "CLAUDE_CODE_ENTRYPOINT")
        process.environment = environment
        let input = Pipe()
        process.standardInput = input
        process.standardOutput = output
        try process.run()
        input.fileHandleForWriting.write(Data(event.utf8))
        try input.fileHandleForWriting.close()
    }

    func finish() -> String {
        process.waitUntilExit()
        return String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
    }
}

@MainActor
@Suite("hook do Claude Code com o serviço de sessões")
struct HookIntegrationTests {
    private func makeService(root: String) -> ClaudeSessions {
        let paths = FrodoPaths(home: root, runtimeDir: root, cacheDir: root + "/cache", supportDir: root + "/support")
        let suite = "frodo-hook-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        return ClaudeSessions(settings: FrodoSettings(defaults: defaults), paths: paths, scheduler: StubScheduler())
    }

    private func permissionEvent(session: String) -> String {
        #"{"session_id":"\#(session)","cwd":"/Users/u/loja-api","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"rm -rf build"}}"#
    }

    private func waitUntil(_ service: ClaudeSessions, _ condition: () -> Bool) async {
        for _ in 0 ..< 400 where !condition() {
            service.reload()
            try? await Task.sleep(for: .milliseconds(25))
        }
    }

    @Test("Aprovar na ilha devolve a decisão allow ao Claude Code")
    func approvingInTheIslandReturnsAllowToClaudeCode() async throws {
        let root = NSTemporaryDirectory() + "frodo e2e \(UUID().uuidString)"
        let service = makeService(root: root)
        defer {
            service.destroy()
            try? FileManager.default.removeItem(atPath: root)
        }
        let run = try HookRun(runtimeDir: root, event: permissionEvent(session: "abc-1"))
        await waitUntil(service) { service.pending.first?.sessionId == "abc-1" }
        let request = try #require(service.pending.first)
        #expect(request.tool == "Bash")
        #expect(service.sessions.first?.status == .waiting)
        #expect(service.sessions.first?.step == "Bash rm -rf build")
        #expect(service.decide(request, .allow))
        let output = await Task.detached { run.finish() }.value
        #expect(output.contains(#""behavior":"allow""#))
        #expect(output.contains("PermissionRequest"))
    }

    @Test("Negar na ilha devolve deny com a mensagem do Frodo")
    func denyingInTheIslandReturnsDenyWithFrodoMessage() async throws {
        let root = NSTemporaryDirectory() + "frodo e2e \(UUID().uuidString)"
        let service = makeService(root: root)
        defer {
            service.destroy()
            try? FileManager.default.removeItem(atPath: root)
        }
        let run = try HookRun(runtimeDir: root, event: permissionEvent(session: "abc-2"))
        await waitUntil(service) { service.pending.first?.sessionId == "abc-2" }
        let request = try #require(service.pending.first)
        #expect(service.decide(request, .deny))
        let output = await Task.detached { run.finish() }.value
        #expect(output.contains(#""behavior":"deny""#))
        #expect(output.contains("Negado pela ilha do Frodo."))
    }

    @Test("com o app fechado o hook não espera e não responde")
    func withTheAppClosedTheHookDoesNotWaitNorAnswer() async throws {
        let root = NSTemporaryDirectory() + "frodo e2e \(UUID().uuidString)"
        try FileManager.default.createDirectory(atPath: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(atPath: root) }
        let started = Date()
        let run = try HookRun(runtimeDir: root, event: permissionEvent(session: "abc-3"))
        let output = await Task.detached { run.finish() }.value
        #expect(output.isEmpty)
        #expect(Date().timeIntervalSince(started) < 5)
        #expect(FileManager.default.fileExists(atPath: "\(root)/sessions/abc-3.json"))
    }
}
