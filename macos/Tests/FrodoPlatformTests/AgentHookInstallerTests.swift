import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

private struct Sandbox {
    let root = NSTemporaryDirectory() + "frodo-agent-hook-\(UUID().uuidString)"

    var paths: FrodoPaths {
        FrodoPaths(home: root, runtimeDir: "\(root)/run", cacheDir: "\(root)/cache", supportDir: "\(root)/Application Support/Frodo")
    }

    func installer(environment: [String: String] = [:], withSource: Bool = true) throws -> AgentHookInstaller {
        guard withSource else { return AgentHookInstaller(paths: paths, environment: environment, hookSource: nil) }
        try FileManager.default.createDirectory(atPath: root, withIntermediateDirectories: true)
        let source = URL(fileURLWithPath: "\(root)/hook.sh")
        try Data("#!/bin/sh\n".utf8).write(to: source)
        return AgentHookInstaller(paths: paths, environment: environment, hookSource: source)
    }

    func write(_ path: String, _ text: String) throws {
        try FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
        try text.write(toFile: path, atomically: true, encoding: .utf8)
    }

    func read(_ path: String) -> String? {
        try? String(contentsOfFile: path, encoding: .utf8)
    }

    func cleanup() { try? FileManager.default.removeItem(atPath: root) }
}

@Suite("instalação do hook do Codex e do Gemini")
struct AgentHookInstallerTests {
    @Test("arquivo ausente cria a configuração com o script entre aspas e instala o script")
    func missingFileIsCreated() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        let installer = try sandbox.installer()
        let path = installer.configPath(.codex)
        #expect(path == "\(sandbox.root)/.codex/hooks.json")
        #expect(!installer.installed(.codex))
        #expect(installer.install(.codex) == .success(path))
        #expect(sandbox.read(path)?.contains("'\(sandbox.paths.hookScript)' codex") == true)
        #expect(sandbox.read(path)?.hasSuffix("}\n") == true)
        #expect(installer.installed(.codex))
        #expect(FileManager.default.fileExists(atPath: sandbox.paths.hookScript))
        #expect(!FileManager.default.fileExists(atPath: path + ".frodo.bak"))
    }

    @Test("JSON inválido devolve notMergeable e não escreve")
    func invalidJsonIsNotWritten() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        let installer = try sandbox.installer()
        let path = installer.configPath(.codex)
        try sandbox.write(path, "{nope")
        let result = installer.install(.codex)
        #expect(result == .failure(.notMergeable("~/.codex/hooks.json")))
        if case let .failure(error) = result {
            #expect(error.message == "Não deu para mesclar ~/.codex/hooks.json. Confira se o arquivo é JSON válido.")
        }
        #expect(sandbox.read(path) == "{nope")
        #expect(!FileManager.default.fileExists(atPath: path + ".frodo.bak"))
    }

    @Test("hooks de terceiros ficam e o original vai para .frodo.bak")
    func thirdPartyHooksArePreserved() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        let installer = try sandbox.installer()
        let path = installer.configPath(.gemini)
        #expect(path == "\(sandbox.root)/.gemini/settings.json")
        let original = #"{"theme":"x","hooks":{"BeforeTool":[{"matcher":"*","hooks":[{"type":"command","command":"outro.sh"}]}]}}"#
        try sandbox.write(path, original)
        #expect(installer.install(.gemini) == .success(path))
        let after = sandbox.read(path) ?? ""
        #expect(after.contains("outro.sh"))
        #expect(after.contains(#""theme": "x""#))
        #expect(after.contains("'\(sandbox.paths.hookScript)' gemini"))
        #expect(sandbox.read(path + ".frodo.bak") == original)
    }

    @Test("segunda vez não reescreve")
    func secondInstallDoesNotRewrite() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        let installer = try sandbox.installer()
        let path = installer.configPath(.gemini)
        #expect(installer.install(.gemini) == .success(path))
        let past = Date(timeIntervalSince1970: 1_000_000_000)
        try FileManager.default.setAttributes([.modificationDate: past], ofItemAtPath: path)
        #expect(installer.install(.gemini) == .success(path))
        let modified = try FileManager.default.attributesOfItem(atPath: path)[.modificationDate] as? Date
        #expect(modified == past)
        #expect(!FileManager.default.fileExists(atPath: path + ".frodo.bak"))
    }

    @Test("CODEX_HOME muda o caminho do Codex")
    func codexHomeChangesThePath() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        let installer = try sandbox.installer(environment: ["CODEX_HOME": "\(sandbox.root)/outro"])
        #expect(installer.configPath(.codex) == "\(sandbox.root)/outro/hooks.json")
        #expect(installer.displayPath(.codex) == "~/outro/hooks.json")
    }

    @Test("sem o script do hook não grava a configuração")
    func missingScriptWritesNothing() throws {
        let sandbox = Sandbox()
        defer { sandbox.cleanup() }
        let installer = try sandbox.installer(withSource: false)
        #expect(installer.install(.codex) == .failure(.writeFailed("~/.codex/hooks.json")))
        #expect(!FileManager.default.fileExists(atPath: installer.configPath(.codex)))
    }
}
