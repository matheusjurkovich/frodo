import Foundation
import Testing

@testable import FrodoCore

@Suite("sessões do Claude")
struct ClaudeSessionsTests {
    @Test("concluída vira ociosa depois de 30 minutos")
    func doneBecomesIdleAfterThirtyMinutes() {
        let done = makeSession("s1", status: .done)
        #expect(displayStatus(done, now: referenceDate.addingTimeInterval(29 * 60)) == .done)
        #expect(displayStatus(done, now: referenceDate.addingTimeInterval(31 * 60)) == .idle)
    }

    @Test("outros status não viram ociosos com o tempo")
    func otherStatusesStayAsTheyAre() {
        let working = makeSession("s1", status: .working)
        #expect(displayStatus(working, now: referenceDate.addingTimeInterval(120 * 60)) == .working)
    }

    @Test("conta por status")
    func countsByStatus() {
        let working = makeSession("a", status: .working)
        let done = makeSession("b", status: .done)
        #expect(countByStatus([working, done], now: referenceDate) == StatusCounts(all: 2, working: 1, waiting: 0, done: 1, idle: 0))
    }

    @Test("concluída antiga entra na contagem de ociosas")
    func staleDoneCountsAsIdle() {
        let done = makeSession("a", status: .done)
        let counts = countByStatus([done], now: referenceDate.addingTimeInterval(31 * 60))
        #expect(counts == StatusCounts(all: 1, working: 0, waiting: 0, done: 0, idle: 1))
    }
}

@Suite("pedidos de permissão pendentes")
struct PendingRequestsTests {
    @Test("escolhe o pedido mais antigo, opcionalmente da sessão")
    func picksOldestRequestOptionallyFromSession() {
        let a = makeRequest("a.1", sessionId: "a", since: 30)
        let b = makeRequest("b.1", sessionId: "b", since: 10)
        let c = makeRequest("a.2", sessionId: "a", since: 20)
        #expect(oldestPending([a, b, c]) == b)
        #expect(oldestPending([a, b, c], sessionId: "a") == c)
        #expect(oldestPending([], sessionId: "a") == nil)
    }
}

private let at = utc(2026, 10, 27, 12, 0)

private func event(_ name: String, _ extra: [String: JSONValue] = [:]) -> HookEvent {
    var fields: [String: JSONValue] = [
        "session_id": .string("s1"), "cwd": .string("/home/u/loja-api"), "transcript_path": .string("/t/s1.jsonl"), "hook_event_name": .string(name),
    ]
    fields.merge(extra) { _, new in new }
    let text = (try? JSONEncoder().encode(JSONValue.object(["pid": .number(42), "event": .object(fields)])))
        .map { String(decoding: $0, as: UTF8.self) } ?? ""
    return parseHookEvent(text) ?? HookEvent(sessionId: "", cwd: "", name: "invalido", tool: nil, input: [:], notificationType: nil, pid: nil)
}

private func bash(_ command: String) -> [String: JSONValue] {
    ["tool_name": .string("Bash"), "tool_input": .object(["command": .string(command)])]
}

@Suite("máquina de estados da sessão")
struct SessionStateMachineTests {
    @Test("trabalhando com o passo da ferramenta")
    func workingWithToolStep() {
        let state = nextState(previous: nil, event: event("PreToolUse", bash("npm test\nmais")), at: at)
        #expect(state?.status == .working)
        #expect(state?.repo == "loja-api")
        #expect(state?.tool == "Bash")
        #expect(state?.step == "Bash npm test")
        #expect(state?.pid == 42)
    }

    @Test("pedido de permissão mantém o comando")
    func permissionPromptKeepsCommand() {
        let working = nextState(previous: nil, event: event("PreToolUse", bash("npm test")), at: at)
        let waiting = nextState(
            previous: working, event: event("Notification", ["notification_type": .string("permission_prompt"), "message": .string("x")]),
            at: at.addingTimeInterval(1)
        )
        #expect(waiting?.status == .waiting)
        #expect(waiting?.step == "Bash npm test")
    }

    @Test("para, fica ociosa e encerra")
    func stopsBecomesIdleAndEnds() {
        guard let done = nextState(previous: nil, event: event("Stop"), at: at) else {
            Issue.record("sem estado")
            return
        }
        #expect(displayStatus(done, now: at.addingTimeInterval(29 * 60)) == .done)
        #expect(displayStatus(done, now: at.addingTimeInterval(31 * 60)) == .idle)
        #expect(nextState(previous: done, event: event("SessionEnd"), at: at) == nil)
    }

    @Test("mapeia cada evento")
    func mapsEachEvent() {
        let working = nextState(previous: nil, event: event("PreToolUse", bash("npm test")), at: at)
        let waiting = nextState(previous: working, event: event("PermissionRequest", bash("rm -rf x")), at: at)
        let done = nextState(previous: working, event: event("Stop"), at: at)
        struct Case {
            let label: String
            let previous: SessionState?
            let name: String
            let extra: [String: JSONValue]
            let status: SessionStatus
            let tool: String?
            let step: String
        }
        let cases = [
            Case(label: "SessionStart", previous: nil, name: "SessionStart", extra: ["source": .string("startup")], status: .idle, tool: nil, step: ""),
            Case(label: "UserPromptSubmit", previous: nil, name: "UserPromptSubmit", extra: ["prompt": .string("oi")], status: .working, tool: nil, step: "Pensando"),
            Case(label: "PermissionRequest", previous: working, name: "PermissionRequest", extra: bash("rm -rf x"), status: .waiting, tool: "Bash", step: "Bash rm -rf x"),
            Case(label: "PreCompact", previous: working, name: "PreCompact", extra: [:], status: .working, tool: nil, step: "Compactando contexto"),
            Case(label: "idle_prompt trabalhando", previous: working, name: "Notification", extra: ["notification_type": .string("idle_prompt")], status: .idle, tool: "Bash", step: "Bash npm test"),
            Case(label: "idle_prompt concluída", previous: done, name: "Notification", extra: ["notification_type": .string("idle_prompt")], status: .done, tool: "Bash", step: "Bash npm test"),
            Case(label: "outra notificação", previous: working, name: "Notification", extra: ["notification_type": .string("auth_success")], status: .working, tool: "Bash", step: "Bash npm test"),
            Case(label: "PostToolUseFailure", previous: waiting, name: "PostToolUseFailure", extra: bash("npm run lint"), status: .working, tool: "Bash", step: "Bash npm run lint"),
            Case(label: "evento desconhecido", previous: working, name: "SubagentStop", extra: [:], status: .working, tool: "Bash", step: "Bash npm test"),
        ]
        for item in cases {
            let state = nextState(previous: item.previous, event: event(item.name, item.extra), at: at.addingTimeInterval(1))
            #expect(state?.status == item.status, "\(item.label)")
            #expect(state?.tool == item.tool, "\(item.label)")
            #expect(state?.step == item.step, "\(item.label)")
        }
        #expect(nextState(previous: done, event: event("Notification", ["notification_type": .string("idle_prompt")]), at: at.addingTimeInterval(60))?.updatedAt == at)
    }

    @Test("since guarda o início do status e só muda quando o status muda")
    func sinceKeepsStatusStartAndOnlyChangesWithStatus() {
        let started = nextState(previous: nil, event: event("UserPromptSubmit", ["prompt": .string("oi")]), at: at)
        let working = nextState(previous: started, event: event("PreToolUse", bash("npm test")), at: at.addingTimeInterval(5))
        let again = nextState(previous: working, event: event("PostToolUse", bash("npm test")), at: at.addingTimeInterval(9))
        let waiting = nextState(previous: again, event: event("PermissionRequest", bash("npm test")), at: at.addingTimeInterval(12))
        let resumed = nextState(previous: waiting, event: event("PostToolUse", bash("npm test")), at: at.addingTimeInterval(20))
        let done = nextState(previous: resumed, event: event("Stop"), at: at.addingTimeInterval(30))
        let idlePrompt = nextState(previous: done, event: event("Notification", ["notification_type": .string("idle_prompt")]), at: at.addingTimeInterval(90))
        let sinces = [started, working, again, waiting, resumed, done, idlePrompt].map { $0?.since.timeIntervalSince(at) }
        #expect(sinces == [0, 0, 0, 12, 20, 30, 30])
        #expect(again?.updatedAt == at.addingTimeInterval(9))
    }

    @Test("descreve o passo por ferramenta")
    func describesStepPerTool() {
        #expect(stepFor(tool: "Edit", input: ["file_path": .string("/r/src/Main.ts")]) == "Edit Main.ts")
        #expect(stepFor(tool: "Grep", input: ["pattern": .string("TODO")]) == "Grep TODO")
        #expect(stepFor(tool: "Agent", input: ["description": .string("Revisar PR")]) == "Agent Revisar PR")
        #expect(stepFor(tool: "Mystery", input: [:]) == "Mystery")
    }

    @Test("ignora arquivos inválidos")
    func ignoresInvalidFiles() {
        #expect(parseHookEvent("{") == nil)
        #expect(parseHookEvent(#"{"pid":1,"event":{"hook_event_name":"Stop"}}"#) == nil)
    }

    @Test("conta por status a partir dos eventos")
    func countsByStatusFromEvents() {
        let working = nextState(previous: nil, event: event("PreToolUse", ["tool_name": .string("Read"), "tool_input": .object(["file_path": .string("/a")])]), at: at)
        let done = nextState(previous: nil, event: event("Stop"), at: at)
        let states = [working, done].compactMap { $0 }
        #expect(countByStatus(states, now: at) == StatusCounts(all: 2, working: 1, waiting: 0, done: 1, idle: 0))
    }

    @Test("monta a meta sem lacunas")
    func buildsMetaWithoutGaps() {
        guard let state = nextState(previous: nil, event: event("PreToolUse", ["tool_name": .string("Read"), "tool_input": .object(["file_path": .string("/a")])]), at: at) else {
            Issue.record("sem estado")
            return
        }
        let stats = SessionStats(
            tokens: 86_000, model: "claude-opus-4-5", contextTokens: 62_000, branch: "main",
            startedAt: at.addingTimeInterval(-4 * 60), lastAt: at.addingTimeInterval(-60), todos: nil
        )
        func withModel(_ model: String) -> SessionStats {
            SessionStats(tokens: stats.tokens, model: model, contextTokens: stats.contextTokens, branch: stats.branch, startedAt: stats.startedAt, lastAt: stats.lastAt, todos: nil)
        }
        let noBranch = SessionStats(tokens: stats.tokens, model: stats.model, contextTokens: stats.contextTokens, branch: nil, startedAt: stats.startedAt, lastAt: stats.lastAt, todos: nil)
        #expect(sessionMeta(state, stats: stats, status: .working, now: at) == "Opus 4.5 · main · 4 min")
        #expect(sessionMeta(state, stats: withModel(""), status: .working, now: at) == "main · 4 min")
        #expect(sessionMeta(state, stats: noBranch, status: .waiting, now: at) == "Opus 4.5 · 4 min")
        #expect(sessionMeta(state, stats: nil, status: .working, now: at) == "")
        #expect(sessionMeta(state, stats: stats, status: .idle, now: at.addingTimeInterval(2 * 3600)) == "Opus 4.5 · main · parada há 2 h 01 min")
        #expect(sessionMeta(state, stats: nil, status: .idle, now: at.addingTimeInterval(30 * 60)) == "parada há 30 min")
    }

    @Test("mede o contexto e avisa a partir de 85%")
    func measuresContextAndWarnsFromEightyFivePercent() {
        #expect(contextUsage(0) == nil)
        #expect(contextUsage(62_000) == ContextUsage(fraction: 0.31, warn: false, text: "62 mil de 200 mil tokens"))
        #expect(contextUsage(169_000)?.warn == false)
        #expect(contextUsage(170_000)?.warn == true)
        #expect(contextUsage(300_000) == ContextUsage(fraction: 0.3, warn: false, text: "300 mil de 1 mi tokens"))
    }

    @Test("lê o diff")
    func readsDiffStat() {
        #expect(parseShortstat(" 3 files changed, 214 insertions(+), 38 deletions(-)\n") == DiffStat(files: 3, added: 214, removed: 38))
        #expect(parseShortstat(" 1 file changed, 2 insertions(+)\n") == DiffStat(files: 1, added: 2, removed: 0))
        #expect(parseShortstat("") == nil)
    }
}

@Suite("arquivos de pedido pendente")
struct PendingFilesTests {
    private let text = #"{"pid":4242,"tool":"Bash","since":1700000000000}"#

    @Test("lê nome e conteúdo do pedido")
    func readsNameAndContent() {
        #expect(
            parsePending(fileName: "abc-1.r-9.json", text: text)
                == PendingRequest(key: "abc-1.r-9", sessionId: "abc-1", request: "r-9", pid: 4242, tool: "Bash", since: Date(timeIntervalSince1970: 1_700_000_000))
        )
    }

    @Test("rejeita nome fora do formato")
    func rejectsMalformedName() {
        for name in ["abc.json", "../x.r.json", "a.b.c.json", "a.r.txt", ".r.json", "a..json", "a b.r.json"] {
            #expect(parsePending(fileName: name, text: text) == nil, "\(name)")
        }
    }

    @Test("rejeita conteúdo inválido")
    func rejectsInvalidContent() {
        let bodies = [
            "", "{", "[]", #"{"pid":"1","tool":"Bash","since":1}"#, #"{"pid":0,"tool":"Bash","since":1}"#, #"{"pid":1.5,"tool":"Bash","since":1}"#,
            #"{"pid":1,"tool":"","since":1}"#, #"{"pid":1,"since":1}"#, #"{"pid":1,"tool":"Bash"}"#,
        ]
        for body in bodies {
            #expect(parsePending(fileName: "a.r.json", text: body) == nil, "\(body)")
        }
    }

    @Test("monta o arquivo de decisão")
    func buildsDecisionFile() {
        #expect(decisionJson(.allow) == "{\"behavior\":\"allow\"}\n")
        #expect(decisionJson(.deny) == "{\"behavior\":\"deny\"}\n")
    }
}
