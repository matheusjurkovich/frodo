import Foundation
import Testing

@testable import FrodoCore

@Suite("transcrição")
struct ClaudeTranscriptTests {
    @Test("separa só linhas completas em bytes")
    func splitsOnlyCompleteLinesInBytes() {
        let result = completeLines(Data("a\nbé\npar".utf8))
        #expect(result.text == "a\nbé\n")
        #expect(result.consumed == 6)
    }

    @Test("sem quebra de linha nada é consumido")
    func nothingConsumedWithoutNewline() {
        let result = completeLines(Data("parcial".utf8))
        #expect(result.text == "")
        #expect(result.consumed == 0)
    }

    @Test("ignora linhas que não são de uso")
    func ignoresLinesThatAreNotUsage() {
        #expect(parseAssistantLine(#"{"type":"user"}"#) == nil)
        #expect(parseAssistantLine("{quebrado") == nil)
    }

    @Test("lê uso, ramo, tarefas e projeto de uma linha do assistente")
    func readsUsageBranchTodosAndProject() {
        let line = """
        {"type":"assistant","sessionId":"s1","timestamp":"2026-10-24T12:00:00.000Z","cwd":"/home/u/loja-api","gitBranch":"main",\
        "isSidechain":false,"message":{"id":"m1","model":"claude-opus-5-5","usage":{"input_tokens":10,"output_tokens":20,\
        "cache_read_input_tokens":30,"cache_creation_input_tokens":40},"content":[{"type":"tool_use","name":"TodoWrite",\
        "input":{"todos":[{"status":"completed"},{"status":"pending"},{"status":"completed"}]}}]}}
        """
        let entry = parseAssistantLine(line)
        #expect(entry?.usage.id == "m1")
        #expect(entry?.usage.project == "loja-api")
        #expect(entry?.usage.sessionId == "s1")
        #expect(entry?.usage.input == 10)
        #expect(entry?.usage.output == 20)
        #expect(entry?.usage.cacheRead == 30)
        #expect(entry?.usage.cacheWrite == 40)
        #expect(entry?.branch == "main")
        #expect(entry?.todos == TodoProgress(done: 2, total: 3))
        #expect(entry?.sidechain == false)
    }

    @Test("descarta modelo sintético")
    func discardsSyntheticModel() {
        let line = #"{"type":"assistant","sessionId":"s","timestamp":"2026-10-24T12:00:00Z","message":{"id":"m","model":"<synthetic>","usage":{}}}"#
        #expect(parseAssistantLine(line) == nil)
    }

    @Test("nomeia modelos e janelas de contexto")
    func namesModelsAndContextWindows() {
        #expect(modelFamily("claude-3-5-haiku-20241022") == .haiku)
        #expect(modelFamily("gpt-x") == .other)
        #expect(modelDisplayName("claude-opus-5-5") == "Opus 5.5")
        #expect(modelDisplayName("claude-sonnet-4-5-20250929") == "Sonnet 4.5")
        #expect(modelDisplayName("claude-3-5-haiku-20241022") == "Haiku 3.5")
        #expect(modelDisplayName("gpt-x") == "gpt-x")
        #expect(contextWindow(62_000) == 200_000)
        #expect(contextWindow(250_000) == 1_000_000)
    }
}
