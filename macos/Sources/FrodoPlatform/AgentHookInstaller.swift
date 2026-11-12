import FrodoCore
import Foundation

public enum AgentHookError: Error, Equatable {
    case notMergeable(String)
    case writeFailed(String)

    public var message: String {
        switch self {
        case let .notMergeable(path): "Não deu para mesclar \(path). Confira se o arquivo é JSON válido."
        case let .writeFailed(path): "Não deu para gravar \(path)."
        }
    }
}

public struct AgentHookInstaller: Sendable {
    private let paths: FrodoPaths
    private let environment: [String: String]
    private let hookSource: URL?

    public init(paths: FrodoPaths, environment: [String: String] = ProcessInfo.processInfo.environment, hookSource: URL? = locateBundledHook()) {
        self.paths = paths
        self.environment = environment
        self.hookSource = hookSource
    }

    public func configPath(_ agent: HookedAgent) -> String {
        switch agent {
        case .codex: "\(environment["CODEX_HOME"].flatMap { $0.isEmpty ? nil : $0 } ?? paths.codexHome)/hooks.json"
        case .gemini: "\(paths.geminiHome)/settings.json"
        }
    }

    public func displayPath(_ agent: HookedAgent) -> String {
        let path = configPath(agent)
        return path.hasPrefix(paths.home + "/") ? "~" + path.dropFirst(paths.home.count) : path
    }

    public func installed(_ agent: HookedAgent) -> Bool {
        hasFrodoHooks(try? String(contentsOfFile: configPath(agent), encoding: .utf8))
    }

    public func install(_ agent: HookedAgent) -> Result<String, AgentHookError> {
        let path = configPath(agent)
        let exists = FileManager.default.fileExists(atPath: path)
        let before = try? String(contentsOfFile: path, encoding: .utf8)
        guard !exists || before != nil, let after = withFrodoHooks(before, agent: agent, script: shellQuoted(paths.hookScript)) else {
            return .failure(.notMergeable(displayPath(agent)))
        }
        do {
            try installHook(paths: paths, source: hookSource)
            if after == before { return .success(path) }
            let dir = (path as NSString).deletingLastPathComponent
            try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            if let before { try before.write(toFile: path + ".frodo.bak", atomically: true, encoding: .utf8) }
            try after.write(toFile: path, atomically: true, encoding: .utf8)
            return .success(path)
        } catch {
            return .failure(.writeFailed(displayPath(agent)))
        }
    }
}
