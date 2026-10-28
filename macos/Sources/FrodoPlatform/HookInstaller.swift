import FrodoCore
import Foundation

public enum HookInstallError: Error {
    case sourceNotFound
}

public func locateBundledHook(bundle: Bundle = .main, sourceFile: String = #filePath) -> URL? {
    if let bundled = bundle.url(forResource: "claude-session", withExtension: "sh", subdirectory: "hooks") { return bundled }
    let repositoryRoot = URL(fileURLWithPath: sourceFile).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let development = repositoryRoot.appendingPathComponent("shared/hooks/claude-session.sh")
    return FileManager.default.fileExists(atPath: development.path) ? development : nil
}

@discardableResult
public func installHook(paths: FrodoPaths, source: URL? = locateBundledHook()) throws -> String {
    guard let source else { throw HookInstallError.sourceNotFound }
    try FileManager.default.createDirectory(atPath: paths.hooksDir, withIntermediateDirectories: true)
    let target = URL(fileURLWithPath: paths.hookScript)
    try? FileManager.default.removeItem(at: target)
    try FileManager.default.copyItem(at: source, to: target)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: target.path)
    return paths.hookScript
}
