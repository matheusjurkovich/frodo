import Foundation
import Testing

@testable import FrodoCore

private let groups = ModelGroups(
    order: ["opus", "sonnet"],
    family: { $0.split(separator: "-").first.map(String.init) ?? "" },
    label: { $0.uppercased() }
)

private let now = localDate(2026, 10, 28, 14, 30)

private func cell(
    _ hour: Date, model: String = "opus-5", project: String = "frodo", session: String = "s1",
    input: Int = 10, output: Int = 5, cacheRead: Int = 0
) -> UsageCell {
    UsageCell(hour: hour, model: model, project: project, session: session, input: input, output: output, cacheRead: cacheRead)
}

private func today(_ hour: Int) -> Date {
    localDate(2026, 10, 28, hour)
}

private func daysAgo(_ days: Int, _ hour: Int = 12) -> Date {
    localDate(2026, 10, 28 - days, hour)
}

private func ints(_ values: Int...) -> [Int] {
    values
}

private func totals(_ summary: ConsumptionSummary) -> [Int] {
    [summary.input, summary.output, summary.cacheRead, summary.total, summary.sessions]
}

@Suite("consumption")
struct ConsumptionTests {
    @Test("hourStart corta minutos, segundos e milissegundos")
    func hourStartCuts() {
        let date = localDate(2026, 10, 28, 14, 37).addingTimeInterval(12.345)
        #expect(hourStart(date, calendar: .current) == today(14))
        #expect(hourStart(today(14), calendar: .current) == today(14))
    }

    @Test("dayStart volta dias atravessando o mês e avança com valor negativo")
    func dayStartMonths() {
        let date = localDate(2026, 11, 2, 15, 45)
        #expect(dayStart(date, calendar: .current) == localDate(2026, 11, 2))
        #expect(dayStart(date, daysBack: 3, calendar: .current) == localDate(2026, 10, 30))
        #expect(dayStart(date, daysBack: -1, calendar: .current) == localDate(2026, 11, 3))
    }

    @Test("addCell soma células da mesma chave sem alterar a original")
    func addsCells() {
        var cells: [String: UsageCell] = [:]
        let first = cell(today(10), cacheRead: 3)
        addCell(&cells, first)
        addCell(&cells, first)
        addCell(&cells, cell(today(10), session: "s2"))
        #expect(cells.count == 2)
        var doubled = first
        doubled.input = 20
        doubled.output = 10
        doubled.cacheRead = 6
        #expect(cells[cellKey(first)] == doubled)
        #expect(first.input == 10)
    }

    @Test("cellKey distingue hora, modelo, projeto e sessão")
    func keys() {
        let base = cell(today(10))
        var bigger = base
        bigger.input = 99
        let keys = Set([
            cellKey(base),
            cellKey(cell(today(11))),
            cellKey(cell(today(10), model: "sonnet-5")),
            cellKey(cell(today(10), project: "outro")),
            cellKey(cell(today(10), session: "s2")),
            cellKey(bigger),
        ])
        #expect(keys.count == 5)
    }

    @Test("hoje soma só as células do dia e conta sessões distintas")
    func todayTotals() {
        let summary = summarize(
            [
                cell(today(9), input: 100, output: 20, cacheRead: 7),
                cell(today(23), session: "s2", input: 1, output: 2),
                cell(daysAgo(1, 23), input: 1000),
                cell(daysAgo(-1, 0), input: 1000),
            ],
            period: .today, now: now, groups: groups
        )
        #expect(totals(summary) == ints(101, 22, 7, 123, 2))
    }

    @Test("hoje desenha das 8h às 18h, marca a hora atual e as futuras")
    func todayBars() {
        let bars = summarize([cell(today(10)), cell(today(10), session: "s2")], period: .today, now: now, groups: groups).bars
        #expect(bars.map(\.label) == ["08h", "09h", "10h", "11h", "12h", "13h", "14h", "15h", "16h", "17h", "18h"])
        #expect(bars[2].value == 30)
        #expect(bars.filter(\.current).map(\.label) == ["14h"])
        #expect(bars.filter(\.future).map(\.label) == ["15h", "16h", "17h", "18h"])
    }

    @Test("hoje estende até a hora mais cedo com uso e até a hora atual, rotulando de duas em duas")
    func todayExtends() {
        let late = localDate(2026, 10, 28, 21, 5)
        let bars = summarize(
            [cell(today(5)), cell(today(3), input: 0, output: 0, cacheRead: 50)], period: .today, now: late, groups: groups
        ).bars
        #expect(bars.count == 17)
        #expect(bars[0] == Bar(label: "05h", value: 15, current: false, future: false))
        #expect(bars[1].label == "")
        #expect(bars[2].label == "07h")
        #expect(bars[16] == Bar(label: "21h", value: 0, current: true, future: false))
    }

    @Test("7 dias tem uma barra por dia com o nome do dia e corta o oitavo dia")
    func week() {
        let summary = summarize(
            [cell(daysAgo(6)), cell(daysAgo(7), input: 999), cell(today(1)), cell(today(20))], period: .week, now: now, groups: groups
        )
        #expect(summary.total == 45)
        let names = (0 ..< 7).map { weekdayLabel(Calendar.current.component(.weekday, from: daysAgo(6 - $0)) - 1) }
        #expect(summary.bars.map(\.label) == names)
        #expect(summary.bars.map(\.value) == ints(15, 0, 0, 0, 0, 0, 30))
        #expect(summary.bars.map(\.current) == [false, false, false, false, false, false, true])
        #expect(summary.bars.map(\.future) == Array(repeating: false, count: 7))
    }

    @Test("30 dias rotula a data a cada sete barras")
    func month() {
        let summary = summarize([cell(daysAgo(29)), cell(daysAgo(30))], period: .month, now: now, groups: groups)
        #expect(summary.total == 15)
        #expect(summary.bars.count == 30)
        #expect(summary.bars[0].value == 15)
        #expect(summary.bars.map(\.label).filter { !$0.isEmpty } == ["29/9", "6/10", "13/10", "20/10", "27/10"])
        #expect(summary.bars[7].label == "6/10")
        #expect(summary.bars[29].current)
    }

    @Test("modelos seguem a ordem das famílias, usam o rótulo do modelo mais recente e somem sem tokens")
    func models() {
        let summary = summarize(
            [
                cell(today(12), model: "sonnet-4", input: 50, output: 0),
                cell(today(10), model: "opus-4", input: 10, output: 0),
                cell(today(12), model: "opus-5", input: 20, output: 0),
                cell(today(11), model: "opus-4", input: 10, output: 0),
                cell(today(13), model: "haiku-4", input: 10, output: 0),
            ],
            period: .today, now: now, groups: groups
        )
        #expect(
            summary.models == [
                Share(name: "opus", label: "OPUS-5", tokens: 40, fraction: 0.4),
                Share(name: "sonnet", label: "SONNET-4", tokens: 50, fraction: 0.5),
            ]
        )
        let cacheOnly = summarize(
            [cell(today(10), model: "sonnet-4", input: 0, output: 0, cacheRead: 9)], period: .today, now: now, groups: groups
        )
        #expect(cacheOnly.models.isEmpty)
    }

    @Test("projetos ficam nos quatro maiores, com empate em ordem alfabética")
    func projects() {
        let summary = summarize(
            [
                cell(today(10), project: "e", input: 1, output: 0),
                cell(today(10), project: "d", input: 2, output: 0),
                cell(today(10), project: "c", input: 2, output: 0),
                cell(today(10), project: "b", input: 5, output: 0),
                cell(today(10), project: "a", input: 3, output: 0),
                cell(today(10), project: "z", input: 0, output: 0, cacheRead: 100),
            ],
            period: .today, now: now, groups: groups
        )
        #expect(summary.projects.map(\.name) == ["b", "a", "c", "d"])
        #expect(summary.projects.map(\.tokens) == ints(5, 3, 2, 2))
        #expect(abs(summary.projects[0].fraction - 5.0 / 13.0) < 1e-9)
    }

    @Test("sem células devolve tudo zerado")
    func empty() {
        let summary = summarize([], period: .week, now: now, groups: groups)
        #expect(totals(summary) == ints(0, 0, 0, 0, 0))
        #expect(summary.models.isEmpty)
        #expect(summary.projects.isEmpty)
        #expect(summary.bars.allSatisfy { $0.value == 0 })
    }
}
