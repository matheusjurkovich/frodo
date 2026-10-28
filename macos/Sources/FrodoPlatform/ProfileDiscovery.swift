import FrodoCore
import Foundation

@MainActor
private var profileSequence = 0

@MainActor
public func makeProfileId() -> String {
    profileSequence += 1
    return "p\(String(Int(Date().timeIntervalSince1970 * 1000), radix: 36))\(String(profileSequence, radix: 36))"
}

@MainActor
public func profile(for configDir: String) -> ClaudeProfile {
    ClaudeProfile(id: makeProfileId(), label: labelForDirName((configDir as NSString).lastPathComponent), configDir: configDir)
}

public func discoverConfigDirs(home: String, store: any CredentialStore) async -> [String] {
    let names = (try? FileManager.default.contentsOfDirectory(atPath: home)) ?? []
    var found: [String] = []
    for name in names where name == ".claude" || name.hasPrefix(".claude-") {
        let directory = "\(home)/\(name)"
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: directory, isDirectory: &isDirectory), isDirectory.boolValue else { continue }
        if await store.exists(configDir: directory) { found.append(directory) }
    }
    return found.sorted { first, second in
        if first.hasSuffix("/.claude") { return true }
        if second.hasSuffix("/.claude") { return false }
        return first.localizedCompare(second) == .orderedAscending
    }
}

@MainActor
public func ensureProfiles(settings: FrodoSettings, store: any CredentialStore, paths: FrodoPaths) async -> [ClaudeProfile] {
    let existing = settings.claudeProfiles
    if !existing.isEmpty || settings.claudeProfilesInitialized { return existing }
    let discovered = await discoverConfigDirs(home: paths.home, store: store).map { profile(for: $0) }
    let profiles = discovered.isEmpty ? [profile(for: paths.defaultClaudeConfigDir)] : discovered
    settings.claudeProfiles = profiles
    settings.claudeProfilesInitialized = true
    return profiles
}
