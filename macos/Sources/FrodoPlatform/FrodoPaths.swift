import Foundation

public struct FrodoPaths: Sendable {
    public let home: String
    public let runtimeDir: String
    public let cacheDir: String
    public let supportDir: String

    public init(home: String, runtimeDir: String, cacheDir: String, supportDir: String) {
        self.home = home
        self.runtimeDir = runtimeDir
        self.cacheDir = cacheDir
        self.supportDir = supportDir
    }

    public static func live(environment: [String: String] = ProcessInfo.processInfo.environment) -> FrodoPaths {
        let home = NSHomeDirectory()
        let support = "\(home)/Library/Application Support/Frodo"
        return FrodoPaths(
            home: home,
            runtimeDir: environment["FRODO_RUNTIME_DIR"] ?? "\(support)/run",
            cacheDir: "\(home)/Library/Caches/Frodo",
            supportDir: support
        )
    }

    public var hooksDir: String { "\(supportDir)/hooks" }
    public var hookScript: String { "\(hooksDir)/claude-session.sh" }
    public var sessionsDir: String { "\(runtimeDir)/sessions" }
    public var pendingDir: String { "\(runtimeDir)/pending" }
    public var decisionsDir: String { "\(runtimeDir)/decisions" }
    public var aliveFile: String { "\(runtimeDir)/alive" }
    public var indexCacheFile: String { "\(cacheDir)/claude-index.json" }
    public var defaultClaudeConfigDir: String { "\(home)/.claude" }
}
