import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

private struct DirectoryStore: CredentialStore {
    let withLogin: Set<String>

    func read(configDir: String) async -> String? { withLogin.contains(configDir) ? "x" : nil }
    func exists(configDir: String) async -> Bool { withLogin.contains(configDir) }
}

@MainActor
private func freshSettings() -> FrodoSettings {
    let suite = "frodo-profiles-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite) ?? .standard
    defaults.removePersistentDomain(forName: suite)
    return FrodoSettings(defaults: defaults)
}

private func makeHome(_ folders: [String]) throws -> String {
    let home = NSTemporaryDirectory() + "frodo-home-\(UUID().uuidString)"
    for folder in folders {
        try FileManager.default.createDirectory(atPath: "\(home)/\(folder)", withIntermediateDirectories: true)
    }
    return home
}

private func paths(home: String) -> FrodoPaths {
    FrodoPaths(home: home, runtimeDir: "\(home)/run", cacheDir: "\(home)/cache", supportDir: "\(home)/support")
}

@MainActor
@Suite("ensureProfiles")
struct ProfileDiscoveryTests {
    @Test("já inicializado devolve os perfis salvos sem procurar")
    func initializedReturnsSavedProfiles() async throws {
        let home = try makeHome([".claude-trabalho"])
        defer { try? FileManager.default.removeItem(atPath: home) }
        let settings = freshSettings()
        settings.claudeProfilesInitialized = true
        let profiles = await ensureProfiles(settings: settings, store: DirectoryStore(withLogin: ["\(home)/.claude-trabalho"]), paths: paths(home: home))
        #expect(profiles.isEmpty)
        #expect(settings.claudeProfiles.isEmpty)
    }

    @Test("descobre as pastas com login e salva")
    func discoversFoldersWithLoginAndSaves() async throws {
        let home = try makeHome([".claude", ".claude-trabalho", ".claude-sem-login"])
        defer { try? FileManager.default.removeItem(atPath: home) }
        let settings = freshSettings()
        let store = DirectoryStore(withLogin: ["\(home)/.claude", "\(home)/.claude-trabalho"])
        let profiles = await ensureProfiles(settings: settings, store: store, paths: paths(home: home))
        #expect(profiles.map(\.configDir) == ["\(home)/.claude", "\(home)/.claude-trabalho"])
        #expect(profiles.map(\.label) == ["Claude", "Trabalho"])
        #expect(settings.claudeProfiles == profiles)
        #expect(settings.claudeProfilesInitialized)
    }

    @Test("sem nenhuma pasta com login usa a pasta padrão")
    func withoutLoginFallsBackToDefaultFolder() async throws {
        let home = try makeHome([".claude-sem-login"])
        defer { try? FileManager.default.removeItem(atPath: home) }
        let settings = freshSettings()
        let profiles = await ensureProfiles(settings: settings, store: DirectoryStore(withLogin: []), paths: paths(home: home))
        #expect(profiles.map(\.configDir) == ["\(home)/.claude"])
        #expect(settings.claudeProfilesInitialized)
    }
}
