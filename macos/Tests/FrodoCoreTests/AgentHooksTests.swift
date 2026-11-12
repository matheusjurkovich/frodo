import Foundation
import Testing

@testable import FrodoCore

private let script = "/x/hooks/claude-session.sh"

private func merged(_ text: String?, _ agent: HookedAgent) -> (text: String, root: [String: JSONValue])? {
    guard let result = withFrodoHooks(text, agent: agent, script: script), let root = JSONValue(text: result)?.object else { return nil }
    return (result, root)
}

private func groups(_ root: [String: JSONValue], _ event: String) -> [JSONValue] {
    root["hooks"]?.field(event)?.array ?? []
}

@Suite("hooks dos agentes")
struct AgentHooksTests {
    @Test("cria a configuração do Codex do zero com espera longa só no pedido de permissão")
    func createsCodexConfigFromScratch() {
        guard let config = merged(nil, .codex) else {
            Issue.record("sem texto")
            return
        }
        let permission = groups(config.root, "PermissionRequest").first?.field("hooks")?.array?.first
        #expect(permission == .object(["type": .string("command"), "command": .string("\(script) codex"), "timeout": .number(600)]))
        #expect(groups(config.root, "Stop").first?.field("hooks")?.array?.first?.field("timeout") == .number(5))
        #expect(groups(config.root, "Stop").first?.field("matcher") == .string(""))
    }

    @Test("preserva hooks e chaves existentes do Gemini")
    func preservesExistingGeminiHooksAndKeys() {
        let before = #"{"model":{"name":"m"},"hooks":{"BeforeTool":[{"matcher":"*","hooks":[{"type":"command","command":"outro"}]}]}}"#
        guard let config = merged(before, .gemini) else {
            Issue.record("sem texto")
            return
        }
        #expect(config.root["model"] == .object(["name": .string("m")]))
        let beforeTool = groups(config.root, "BeforeTool")
        #expect(beforeTool.count == 2)
        #expect(
            beforeTool[1].field("hooks")?.array?.first
                == .object(["name": .string("frodo"), "type": .string("command"), "command": .string("\(script) gemini"), "timeout": .number(5000)])
        )
        #expect(beforeTool[1].field("matcher") == .string("*"))
        #expect(config.root["hooks"]?.field("PermissionRequest") == nil)
    }

    @Test("não duplica quando já está instalado")
    func doesNotDuplicateWhenInstalled() {
        let once = withFrodoHooks("{}", agent: .codex, script: script)
        #expect(withFrodoHooks(once, agent: .codex, script: script) == once)
        #expect(hasFrodoHooks(once))
        #expect(!hasFrodoHooks("{}"))
        #expect(!hasFrodoHooks(nil))
    }

    @Test("recusa arquivo que não dá para mesclar")
    func refusesUnmergeableFile() {
        #expect(withFrodoHooks("{quebrado", agent: .codex, script: script) == nil)
        #expect(withFrodoHooks("[]", agent: .codex, script: script) == nil)
        #expect(withFrodoHooks(#"{"hooks": {"Stop": {}}}"#, agent: .codex, script: script) == nil)
        #expect(withFrodoHooks(#"{"hooks": "x"}"#, agent: .codex, script: script) == nil)
    }

    @Test("não duplica evento que já tem o script de outra forma")
    func skipsEventAlreadyHoldingScript() {
        let before = #"{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"/y/claude-session.sh codex"}]}]}}"#
        guard let config = merged(before, .codex) else {
            Issue.record("sem texto")
            return
        }
        #expect(groups(config.root, "Stop").count == 1)
        #expect(groups(config.root, "SessionStart").count == 1)
    }

    @Test("saída com indentação de 2 espaços, barras sem escape e quebra de linha final")
    func outputIsIndentedWithTrailingNewline() {
        guard let config = merged(nil, .codex) else {
            Issue.record("sem texto")
            return
        }
        #expect(config.text.hasSuffix("}\n"))
        #expect(config.text.hasPrefix("{\n  \"hooks\": {\n    \"PermissionRequest\": [\n      {\n"))
        #expect(config.text.contains("\"command\": \"\(script) codex\""))
        #expect(config.text.contains("\"timeout\": 600,\n"))
    }
}
