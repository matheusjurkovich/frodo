import CryptoKit
import Foundation

public protocol CredentialStore: Sendable {
    func read(configDir: String) async -> String?
    func exists(configDir: String) async -> Bool
}

private let securityTool = "/usr/bin/security"
private let serviceBase = "Claude Code-credentials"

public func keychainServiceNames(configDir: String, defaultConfigDir: String) -> [String] {
    func hashed(_ directory: String) -> String {
        let digest = SHA256.hash(data: Data(directory.precomposedStringWithCanonicalMapping.utf8))
        return "\(serviceBase)-\(digest.map { String(format: "%02x", $0) }.joined().prefix(8))"
    }
    let trimmed = configDir.replacing(/\/+$/, with: "")
    var names = [hashed(trimmed), hashed(trimmed + "/")]
    if trimmed == defaultConfigDir.replacing(/\/+$/, with: "") { names.insert(serviceBase, at: 0) }
    return names
}

public func keychainAccountName(user: String) -> String {
    user.wholeMatch(of: /[a-zA-Z0-9._-]+/) != nil ? user : "claude-code-user"
}

public struct KeychainCredentialStore: CredentialStore {
    private let runner: CommandRunner
    private let user: String
    private let defaultConfigDir: String

    public init(runner: CommandRunner = ProcessCommandRunner(), user: String = NSUserName(), defaultConfigDir: String) {
        self.runner = runner
        self.user = user
        self.defaultConfigDir = defaultConfigDir
    }

    public func read(configDir: String) async -> String? {
        for service in keychainServiceNames(configDir: configDir, defaultConfigDir: defaultConfigDir) {
            let result = await runner.run(
                securityTool, arguments: ["find-generic-password", "-a", keychainAccountName(user: user), "-w", "-s", service], currentDirectory: nil
            )
            if let result, result.status == 0, !result.output.isEmpty { return result.output.trimmingCharacters(in: .whitespacesAndNewlines) }
        }
        return nil
    }

    public func exists(configDir: String) async -> Bool {
        for service in keychainServiceNames(configDir: configDir, defaultConfigDir: defaultConfigDir) {
            let result = await runner.run(
                securityTool, arguments: ["find-generic-password", "-a", keychainAccountName(user: user), "-s", service], currentDirectory: nil
            )
            if result?.status == 0 { return true }
        }
        return false
    }
}

public struct FileCredentialStore: CredentialStore {
    public init() {}

    public func read(configDir: String) async -> String? {
        try? String(contentsOfFile: "\(configDir)/.credentials.json", encoding: .utf8)
    }

    public func exists(configDir: String) async -> Bool {
        FileManager.default.fileExists(atPath: "\(configDir)/.credentials.json")
    }
}

public struct FallbackCredentialStore: CredentialStore {
    private let stores: [any CredentialStore]

    public init(_ stores: [any CredentialStore]) {
        self.stores = stores
    }

    public func read(configDir: String) async -> String? {
        for store in stores {
            if let text = await store.read(configDir: configDir) { return text }
        }
        return nil
    }

    public func exists(configDir: String) async -> Bool {
        for store in stores where await store.exists(configDir: configDir) { return true }
        return false
    }
}
