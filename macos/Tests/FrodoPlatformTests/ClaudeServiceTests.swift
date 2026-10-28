import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

private struct MapStore: CredentialStore {
    let byDirectory: [String: String]

    func read(configDir: String) async -> String? { byDirectory[configDir] }
    func exists(configDir: String) async -> Bool { byDirectory[configDir] != nil }
}

@MainActor
private final class StubScheduler: Scheduler {
    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe { {} }
}

private func credentials(_ token: String) -> String {
    let expiresAt = Int((Date().timeIntervalSince1970 + 3600) * 1000)
    return #"{"claudeAiOauth":{"accessToken":"\#(token)","expiresAt":\#(expiresAt),"subscriptionType":"max","rateLimitTier":"default_claude_max_5x"}}"#
}

@MainActor
private func makeSettings() -> FrodoSettings {
    let suite = "frodo-platform-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite) ?? .standard
    defaults.removePersistentDomain(forName: suite)
    return FrodoSettings(defaults: defaults)
}

private let usageBody = #"{"limits":[{"kind":"session","group":"session","percent":42,"resets_at":"2099-01-01T00:00:00Z"}]}"#
private let profileBody = #"{"account":{"display_name":"Pedro","has_claude_max":true},"application":{"name":"Claude Code"},"organization":{"subscription_status":"active","rate_limit_tier":"default_claude_max_5x"}}"#

@MainActor
@Suite("ClaudeService")
struct ClaudeServiceTests {
    private func waitUntil(_ condition: @MainActor () -> Bool) async {
        for _ in 0 ..< 200 where !condition() {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    @Test("carrega o uso e a conta dos perfis configurados")
    func loadsUsageAndAccountOfConfiguredProfiles() async {
        let settings = makeSettings()
        settings.claudeProfiles = [ClaudeProfile(id: "a", label: "Claude", configDir: "/home/u/.claude")]
        settings.claudeProfilesInitialized = true
        let paths = FrodoPaths(home: "/home/u", runtimeDir: "/tmp/x", cacheDir: "/tmp/y", supportDir: "/tmp/z")
        let service = ClaudeService(
            settings: settings, store: MapStore(byDirectory: ["/home/u/.claude": credentials("t")]),
            transport: { request in
                HTTPResponse(status: 200, body: request.url == usageURL ? usageBody : profileBody)
            },
            paths: paths, scheduler: StubScheduler()
        )
        defer { service.destroy() }
        await waitUntil { service.active?.status == .ok }
        #expect(service.active?.status == .ok)
        #expect(service.active?.windows.map(\.utilization) == [42])
        #expect(service.active?.subtitle == "Pedro · Claude Code · ativo")
        #expect(service.active?.tier == "MAX 5x")
        #expect(service.active?.active == true)
    }

    @Test("perfil sem login aparece como sem login")
    func profileWithoutCredentialsIsSignedOut() async {
        let settings = makeSettings()
        settings.claudeProfiles = [ClaudeProfile(id: "a", label: "Claude", configDir: "/home/u/.claude")]
        settings.claudeProfilesInitialized = true
        let paths = FrodoPaths(home: "/home/u", runtimeDir: "/tmp/x", cacheDir: "/tmp/y", supportDir: "/tmp/z")
        let service = ClaudeService(
            settings: settings, store: MapStore(byDirectory: [:]), transport: { _ in HTTPResponse(status: 200, body: "{}") }, paths: paths,
            scheduler: StubScheduler()
        )
        defer { service.destroy() }
        await waitUntil { service.active?.status == .signedOut }
        #expect(service.active?.status == .signedOut)
        #expect(service.active?.error == "Sem login do Claude Code neste perfil.")
    }

    @Test("401 vira mensagem de sessão expirada e mantém o erro visível")
    func unauthorizedBecomesExpiredSessionMessage() async {
        let settings = makeSettings()
        settings.claudeProfiles = [ClaudeProfile(id: "a", label: "Claude", configDir: "/home/u/.claude")]
        settings.claudeProfilesInitialized = true
        let paths = FrodoPaths(home: "/home/u", runtimeDir: "/tmp/x", cacheDir: "/tmp/y", supportDir: "/tmp/z")
        let service = ClaudeService(
            settings: settings, store: MapStore(byDirectory: ["/home/u/.claude": credentials("t")]),
            transport: { _ in HTTPResponse(status: 401, body: "") }, paths: paths, scheduler: StubScheduler()
        )
        defer { service.destroy() }
        await waitUntil { service.active?.status == .error }
        #expect(service.active?.error == "Sessão expirada. Entre de novo no Claude Code.")
        #expect(service.lastFailed)
    }

    @Test("descobre perfis pelas pastas .claude que têm login")
    func discoversProfilesFromClaudeFoldersWithLogin() async throws {
        let home = NSTemporaryDirectory() + "frodo-home-\(UUID().uuidString)"
        for name in [".claude", ".claude-work", ".claude-sem-login", ".outra"] {
            try FileManager.default.createDirectory(atPath: "\(home)/\(name)", withIntermediateDirectories: true)
        }
        defer { try? FileManager.default.removeItem(atPath: home) }
        let store = MapStore(byDirectory: ["\(home)/.claude": "x", "\(home)/.claude-work": "x"])
        let found = await discoverConfigDirs(home: home, store: store)
        #expect(found == ["\(home)/.claude", "\(home)/.claude-work"])
    }
}
