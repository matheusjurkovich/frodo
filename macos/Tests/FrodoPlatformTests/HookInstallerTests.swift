import Foundation
import Testing

@testable import FrodoPlatform

private struct Sandbox {
    let root = NSTemporaryDirectory() + "frodo-hook-\(UUID().uuidString)"

    var paths: FrodoPaths {
        FrodoPaths(home: root, runtimeDir: "\(root)/run", cacheDir: "\(root)/cache", supportDir: "\(root)/support")
    }

    func source(_ text: String) throws -> URL {
        try FileManager.default.createDirectory(atPath: root, withIntermediateDirectories: true)
        let url = URL(fileURLWithPath: "\(root)/hook-\(UUID().uuidString).sh")
        try Data(text.utf8).write(to: url)
        return url
    }

    func cleanup() { try? FileManager.default.removeItem(atPath: root) }
}

@Suite("instalação do hook")
struct HookInstallerTests {
    @Test("copia o script executável para a pasta de hooks")
    func copiesAnExecutableScript() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        let path = try installHook(paths: sandbox.paths, source: sandbox.source("#!/bin/sh\necho um\n"))
        #expect(path == sandbox.paths.hookScript)
        #expect(try String(contentsOfFile: path, encoding: .utf8) == "#!/bin/sh\necho um\n")
        let permissions = try FileManager.default.attributesOfItem(atPath: path)[.posixPermissions] as? NSNumber
        #expect(permissions?.intValue == 0o755)
    }

    @Test("reinstalar troca o script e não deixa sobra")
    func reinstallingReplacesTheScript() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        try installHook(paths: sandbox.paths, source: sandbox.source("velho"))
        try installHook(paths: sandbox.paths, source: sandbox.source("novo"))
        #expect(try String(contentsOfFile: sandbox.paths.hookScript, encoding: .utf8) == "novo")
        #expect(try FileManager.default.contentsOfDirectory(atPath: sandbox.paths.hooksDir) == ["claude-session.sh"])
    }

    @Test("sem script de origem não mexe no hook instalado")
    func missingSourceKeepsTheInstalledHook() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        try installHook(paths: sandbox.paths, source: sandbox.source("atual"))
        #expect(throws: HookInstallError.self) { try installHook(paths: sandbox.paths, source: nil) }
        #expect(throws: (any Error).self) {
            try installHook(paths: sandbox.paths, source: URL(fileURLWithPath: "\(sandbox.root)/nao-existe.sh"))
        }
        #expect(try String(contentsOfFile: sandbox.paths.hookScript, encoding: .utf8) == "atual")
    }
}
