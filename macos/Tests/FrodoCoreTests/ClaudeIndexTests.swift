import Foundation
import Testing

@testable import FrodoCore

private let now = localDate(2026, 10, 27, 10, 30)

private func ints(_ values: Int...) -> [Int] {
    values
}

private func at(_ day: Int, _ hour: Int, month: Int = 10) -> Date {
    localDate(2026, month, day, hour, 5)
}

private func feed(_ index: inout ClaudeIndex, _ text: String) {
    if let entry = parseAssistantLine(text) { index.add(entry) }
}

private func build() -> ClaudeIndex {
    var index = ClaudeIndex()
    let first = transcriptLine(
        id: "m1", at: at(27, 9), cwd: "/home/u/dynamic-island", session: "s1", input: 100, output: 50, cacheRead: 1000, cacheWrite: 10
    )
    let lines = [
        first,
        first,
        transcriptLine(id: "m2", at: at(27, 10), model: "claude-sonnet-5-5", cwd: "/home/u/loja-api", session: "s2", input: 200, output: 100),
        transcriptLine(id: "m3", at: at(25, 15), cwd: "/home/u/dynamic-island", session: "s3", input: 300),
        transcriptLine(id: "m4", at: at(10, 12), model: "claude-haiku-5-5", cwd: "/home/u/portal", session: "s4", input: 1000),
        transcriptLine(id: "m5", at: at(20, 12, month: 9), cwd: "/home/u/velho", session: "s5", input: 5000),
        transcriptLine(id: "m6", at: at(27, 9), model: "<synthetic>", session: "s1", input: 999),
    ]
    for text in lines { feed(&index, text) }
    index.prune(now: now)
    return index
}

@Suite("ClaudeIndex")
struct ClaudeIndexTests {
    @Test("resume hoje por hora")
    func summarizesTodayByHour() {
        let today = build().summary(.today, now: now)
        #expect(ints(today.input, today.output, today.cacheRead, today.sessions, today.total) == ints(300, 150, 1000, 2, 450))
        #expect(today.bars.map(\.label) == ["08h", "09h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h", "18h"])
        #expect(today.bars.prefix(3).map(\.value) == [0, 150, 300])
        #expect(today.bars.firstIndex(where: \.current) == 2)
        #expect(today.bars.filter(\.future).count == 8)
        #expect(today.models.map(\.label) == ["Opus 5.5", "Sonnet 5.5"])
        #expect(today.models.map(\.tokens) == [150, 300])
        #expect(today.projects.map(\.name) == ["loja-api", "dynamic-island"])
        #expect(today.projects.map(\.tokens) == [300, 150])
    }

    @Test("rotula hora sim, hora não quando o dia passa de 12 horas")
    func labelsEveryOtherHourWhenDayExceedsTwelveHours() {
        let late = localDate(2026, 10, 27, 23, 30)
        var index = ClaudeIndex()
        feed(&index, transcriptLine(id: "cedo", at: at(27, 6), session: "s9", input: 10))
        let labels = index.summary(.today, now: late).bars.map(\.label)
        #expect(labels.count == 18)
        #expect(labels.filter { !$0.isEmpty } == ["06h", "08h", "10h", "12h", "14h", "16h", "18h", "20h", "22h"])
    }

    @Test("resume 7 dias por dia")
    func summarizesSevenDaysByDay() {
        let week = build().summary(.week, now: now)
        #expect(ints(week.input, week.output, week.sessions, week.total) == ints(600, 150, 3, 750))
        #expect(week.bars.map(\.label) == ["Qua", "Qui", "Sex", "Sáb", "Dom", "Seg", "Ter"])
        #expect(week.bars.map(\.value) == [0, 0, 0, 0, 300, 0, 450])
        #expect(week.bars.firstIndex(where: \.current) == 6)
    }

    @Test("resume 30 dias e descarta o que é mais antigo")
    func summarizesThirtyDaysAndDiscardsOlder() {
        let index = build()
        let month = index.summary(.month, now: now)
        #expect(ints(month.input, month.sessions, month.total) == ints(1600, 4, 1750))
        #expect(month.bars.count == 30)
        #expect(month.bars.map(\.label).filter { !$0.isEmpty } == ["28/9", "5/10", "12/10", "19/10", "26/10"])
        #expect(month.projects.map(\.name) == ["portal", "dynamic-island", "loja-api"])
        #expect(index.session("s5") == nil)
    }

    @Test("guarda os números da sessão")
    func keepsSessionNumbers() {
        #expect(
            build().session("s1")
                == SessionStats(tokens: 150, model: "claude-opus-5-5", contextTokens: 1110, branch: "main", startedAt: at(27, 9), lastAt: at(27, 9), todos: nil)
        )
        var index = ClaudeIndex()
        feed(&index, transcriptLine(id: "t", at: at(27, 9), session: "sx", todos: ["completed", "in_progress", "pending"]))
        #expect(index.session("sx")?.todos == TodoProgress(done: 1, total: 3))
    }

    @Test("guarda as tarefas de uma linha repetida sem contar de novo")
    func keepsTodosFromRepeatedLineWithoutCountingAgain() {
        var index = ClaudeIndex()
        feed(&index, transcriptLine(id: "d", at: at(27, 9), session: "sd", input: 10, output: 5))
        feed(&index, transcriptLine(id: "d", at: at(27, 9), session: "sd", input: 10, output: 5, todos: ["completed", "pending"]))
        #expect(index.session("sd")?.tokens == 15)
        #expect(index.session("sd")?.todos == TodoProgress(done: 1, total: 2))
        index.setTodos(sessionId: "sd", timestamp: at(27, 8), todos: TodoProgress(done: 0, total: 9))
        index.setTodos(sessionId: "desconhecida", timestamp: at(27, 10), todos: TodoProgress(done: 1, total: 1))
        #expect(index.session("sd")?.todos == TodoProgress(done: 1, total: 2))
        #expect(index.session("desconhecida") == nil)
    }

    @Test("conta o subagente na sessão sem trocar o modelo nem o contexto dela")
    func countsSubagentWithoutChangingSessionModelNorContext() {
        var index = ClaudeIndex()
        feed(&index, transcriptLine(id: "p1", at: at(27, 9), session: "sc", input: 100, output: 10, cacheRead: 1000, branch: "main"))
        feed(
            &index,
            transcriptLine(
                id: "c1", at: at(27, 10), model: "claude-haiku-5-5", session: "sc", input: 50, output: 5, cacheRead: 9, branch: "outra",
                todos: ["completed"], sidechain: true
            )
        )
        #expect(
            index.session("sc")
                == SessionStats(tokens: 165, model: "claude-opus-5-5", contextTokens: 1100, branch: "main", startedAt: at(27, 9), lastAt: at(27, 10), todos: nil)
        )
        #expect(index.summary(.today, now: now).input == 150)
        feed(&index, transcriptLine(id: "p2", at: localDate(2026, 10, 27, 9, 30), model: "claude-sonnet-5-5", session: "sc", input: 1, cacheRead: 2000))
        #expect(index.session("sc")?.model == "claude-sonnet-5-5")
        #expect(index.session("sc")?.contextTokens == 2001)
        #expect(index.session("sc")?.lastAt == at(27, 10))
    }

    @Test("deixa vazios o modelo e o contexto da sessão só com subagente")
    func leavesModelAndContextEmptyForSubagentOnlySession() {
        var index = ClaudeIndex()
        feed(&index, transcriptLine(id: "c", at: at(27, 9), session: "so", input: 5, output: 1, sidechain: true))
        let copy = roundTrip(index)
        #expect(copy.session("so") == SessionStats(tokens: 6, model: "", contextTokens: 0, branch: nil, startedAt: at(27, 9), lastAt: at(27, 9), todos: nil))
    }

    @Test("conta uma vez o mesmo id em sessões diferentes e esquece o id junto com a célula")
    func countsSameIdOnceAcrossSessionsAndForgetsIdWithCell() {
        var index = ClaudeIndex()
        feed(&index, transcriptLine(id: "h", at: at(27, 9), session: "original", input: 40))
        feed(&index, transcriptLine(id: "h", at: at(27, 9), session: "retomada", input: 40))
        #expect(index.summary(.today, now: now).input == 40)
        #expect(index.session("retomada") == nil)
        let old = transcriptLine(id: "velho", at: at(20, 12, month: 9), session: "sv", input: 7)
        feed(&index, old)
        index.prune(now: now)
        #expect(!index.has("velho"))
        #expect(index.has("h"))
        feed(&index, old)
        index.prune(now: now)
        #expect(index.summary(.month, now: now).input == 40)
    }

    @Test("conta a maior saída de um id repetido, só pela diferença")
    func countsLargestOutputOfRepeatedIdByDifferenceOnly() {
        var grows = ClaudeIndex()
        feed(&grows, transcriptLine(id: "o", at: at(27, 9), session: "so", input: 3, output: 5, cacheRead: 100))
        feed(&grows, transcriptLine(id: "o", at: at(27, 9), session: "so", input: 3, output: 12, cacheRead: 100))
        var shrinks = ClaudeIndex()
        feed(&shrinks, transcriptLine(id: "o", at: at(27, 9), session: "so", input: 3, output: 12, cacheRead: 100))
        feed(&shrinks, transcriptLine(id: "o", at: at(27, 9), session: "so", input: 3, output: 5, cacheRead: 100))
        for index in [grows, shrinks] {
            let today = index.summary(.today, now: now)
            #expect(ints(today.input, today.output, today.cacheRead) == ints(3, 12, 100))
            #expect(index.session("so")?.tokens == 15)
            #expect(index.session("so")?.contextTokens == 103)
        }
        var copy = roundTrip(grows)
        feed(&copy, transcriptLine(id: "o", at: at(27, 10), session: "so", input: 3, output: 20, cacheRead: 100, sidechain: true))
        #expect(copy.summary(.today, now: now).output == 20)
        #expect(copy.summary(.today, now: now).bars[1 ... 2].map(\.value) == [15, 8])
        #expect(copy.session("so")?.tokens == 23)
    }

    @Test("volta do JSON igual e ignora lixo")
    func roundTripsThroughJSONAndIgnoresGarbage() {
        var index = build()
        feed(&index, transcriptLine(id: "t", at: at(27, 9), session: "sx", todos: ["completed", "pending"]))
        let copy = roundTrip(index)
        #expect(copy.summary(.week, now: now) == index.summary(.week, now: now))
        #expect(copy.session("sx") == index.session("sx"))
        #expect(copy.session("sx")?.todos == TodoProgress(done: 1, total: 2))
        #expect(["m1", "m4", "m5"].map { copy.has($0) } == [true, true, false])
        #expect(ClaudeIndex(json: .string("lixo")).summary(.today, now: now).total == 0)
        #expect(ClaudeIndex(json: .object(["version": .number(99)])).summary(.today, now: now).total == 0)
    }

    @Test("serializa uma cópia que não muda com o índice")
    func serializesCopyThatDoesNotChangeWithTheIndex() {
        var index = build()
        let snapshot = index.toJSON()
        feed(&index, transcriptLine(id: "n", at: at(27, 9), cwd: "/home/u/dynamic-island", session: "s1", input: 7, todos: ["pending"]))
        #expect(snapshot == build().toJSON())
        #expect(index.toJSON() != snapshot)
    }
}
