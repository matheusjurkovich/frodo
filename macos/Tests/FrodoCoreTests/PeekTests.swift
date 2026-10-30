import Foundation
import Testing

@testable import FrodoCore

private let utc: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
}()

private func at(_ hour: Int, _ minute: Int, _ second: Int = 0, day: Int = 29) -> Date {
    utc.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute, second: second))!
}

@Suite("nextPeek")
struct NextPeekTests {
    @Test("cai no próximo múltiplo do intervalo no relógio")
    func landsOnTheNextMultipleOfTheInterval() {
        #expect(nextPeek(after: at(10, 42), everyMinutes: 10, calendar: utc) == at(10, 50))
        #expect(nextPeek(after: at(10, 42, 30), everyMinutes: 15, calendar: utc) == at(10, 45))
    }

    @Test("em cima da hora certa pula para o próximo intervalo")
    func exactlyOnTheBoundarySkipsToTheNextInterval() {
        #expect(nextPeek(after: at(10, 50), everyMinutes: 10, calendar: utc) == at(11, 0))
    }

    @Test("vira o dia depois da meia-noite")
    func rollsOverMidnight() {
        #expect(nextPeek(after: at(23, 55), everyMinutes: 10, calendar: utc) == at(0, 0, day: 30))
    }

    @Test("intervalo de uma hora no fim do dia cai na meia-noite")
    func anHourIntervalLateInTheDayLandsOnMidnight() {
        #expect(nextPeek(after: at(23, 30), everyMinutes: 60, calendar: utc) == at(0, 0, day: 30))
    }

    @Test("trata intervalo inválido como um minuto")
    func treatsAnInvalidIntervalAsOneMinute() {
        #expect(nextPeek(after: at(10, 42, 10), everyMinutes: 0, calendar: utc) == at(10, 43))
        #expect(nextPeek(after: at(10, 42, 10), everyMinutes: -3, calendar: utc) == at(10, 43))
    }
}

@MainActor
@Suite("PeekCycle")
struct PeekCycleTests {
    @MainActor
    private final class Harness {
        let scheduler = ManualScheduler()
        let start: Date
        var allowed = true
        var states: [PeekState?] = []
        var cycle: PeekCycle!

        init(startingAt start: Date) {
            self.start = start
            cycle = PeekCycle(
                scheduler: scheduler,
                now: { [unowned self] in self.start.addingTimeInterval(self.scheduler.now) },
                calendar: utc,
                canStart: { [unowned self] in self.allowed },
                onChange: { [unowned self] in self.states.append($0) }
            )
        }
    }

    @Test("arma para o próximo múltiplo do intervalo")
    func armsForTheNextMultipleOfTheInterval() {
        let harness = Harness(startingAt: at(10, 42))
        harness.cycle.update(active: true, everyMinutes: 10, seconds: 10)
        #expect(harness.scheduler.armedIntervals == [480])
        #expect(harness.cycle.current == nil)
    }

    @Test("espia no horário, some depois dos segundos e arma o seguinte")
    func peeksOnTimeHidesAfterTheSecondsAndArmsTheNext() {
        let harness = Harness(startingAt: at(10, 42))
        harness.cycle.update(active: true, everyMinutes: 10, seconds: 10)
        harness.scheduler.advance(by: 480)
        #expect(harness.cycle.current == PeekState(startedAt: at(10, 50), seconds: 10))
        #expect(harness.scheduler.armedIntervals == [10])
        harness.scheduler.advance(by: 10)
        #expect(harness.cycle.current == nil)
        #expect(harness.states == [PeekState(startedAt: at(10, 50), seconds: 10), nil])
        #expect(harness.scheduler.armedIntervals == [590])
    }

    @Test("mostra a hora do múltiplo mesmo se o timer disparar um pouco antes")
    func showsTheBoundaryTimeEvenWhenTheTimerFiresSlightlyEarly() {
        let harness = Harness(startingAt: at(10, 42))
        harness.cycle.update(active: true, everyMinutes: 10, seconds: 10)
        harness.scheduler.advance(by: 479.997)
        harness.scheduler.fire(480)
        #expect(harness.cycle.current?.startedAt == at(10, 50))
    }

    @Test("adia quando não pode começar e tenta no intervalo seguinte")
    func postponesWhenItCannotStartAndTriesOnTheNextInterval() {
        let harness = Harness(startingAt: at(10, 42))
        harness.allowed = false
        harness.cycle.update(active: true, everyMinutes: 10, seconds: 10)
        harness.scheduler.advance(by: 480)
        #expect(harness.cycle.current == nil)
        #expect(harness.states.isEmpty)
        #expect(harness.scheduler.armedIntervals == [600])
        harness.allowed = true
        harness.scheduler.advance(by: 600)
        #expect(harness.cycle.current == PeekState(startedAt: at(11, 0), seconds: 10))
    }

    @Test("desativar cancela o timer e encerra a espiada em curso")
    func deactivatingCancelsTheTimerAndEndsARunningPeek() {
        let harness = Harness(startingAt: at(10, 42))
        harness.cycle.update(active: true, everyMinutes: 10, seconds: 10)
        harness.scheduler.advance(by: 485)
        #expect(harness.cycle.current != nil)
        harness.cycle.update(active: false, everyMinutes: 10, seconds: 10)
        #expect(harness.cycle.current == nil)
        #expect(harness.scheduler.armedIntervals.isEmpty)
        #expect(harness.states.count == 2)
        #expect(harness.states[1] == nil)
    }

    @Test("atualizar durante a espiada não reinicia nem encurta")
    func updatingDuringAPeekDoesNotRestartOrShortenIt() {
        let harness = Harness(startingAt: at(10, 42))
        harness.cycle.update(active: true, everyMinutes: 10, seconds: 10)
        harness.scheduler.advance(by: 482)
        let running = harness.cycle.current
        harness.cycle.update(active: true, everyMinutes: 5, seconds: 30)
        #expect(harness.cycle.current == running)
        #expect(harness.scheduler.armedIntervals == [10])
    }

    @Test("mudar o intervalo antes da hora rearma com o novo")
    func changingTheIntervalBeforeTheTimeRearmsWithTheNewOne() {
        let harness = Harness(startingAt: at(10, 42))
        harness.cycle.update(active: true, everyMinutes: 10, seconds: 10)
        harness.cycle.update(active: true, everyMinutes: 30, seconds: 10)
        #expect(harness.scheduler.armedIntervals == [1080])
    }
}
