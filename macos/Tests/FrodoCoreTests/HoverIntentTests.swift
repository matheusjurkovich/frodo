import Foundation
import Testing

@testable import FrodoCore

@MainActor
@Suite("intenção do hover")
struct HoverIntentTests {
    private func makeIntent(_ scheduler: ManualScheduler) -> HoverIntent {
        HoverIntent(scheduler: scheduler, openDelay: 0.15, closeDelay: 0.3, autoCloseDelay: 5, pollInterval: 0.05)
    }

    @Test("abre depois do atraso com o cursor dentro")
    func opensAfterTheDelay() {
        let scheduler = ManualScheduler()
        let hover = makeIntent(scheduler)
        var opened = 0
        hover.entered(canOpen: true) { opened += 1 }
        scheduler.advance(by: 0.1)
        #expect(opened == 0)
        scheduler.advance(by: 0.1)
        #expect(opened == 1)
    }

    @Test("entrar de novo não adia a abertura")
    func enteringAgainDoesNotDelayOpening() {
        let scheduler = ManualScheduler()
        let hover = makeIntent(scheduler)
        var opened = 0
        hover.entered(canOpen: true) { opened += 1 }
        scheduler.advance(by: 0.1)
        hover.entered(canOpen: true) { opened += 1 }
        scheduler.advance(by: 0.06)
        #expect(opened == 1)
    }

    @Test("sair antes do atraso cancela a abertura")
    func leavingBeforeTheDelayCancelsOpening() {
        let scheduler = ManualScheduler()
        let hover = makeIntent(scheduler)
        var opened = 0
        hover.entered(canOpen: true) { opened += 1 }
        hover.left(canClose: false) {}
        scheduler.advance(by: 1)
        #expect(opened == 0)
    }

    @Test("voltar para dentro cancela o fechamento")
    func comingBackCancelsClosing() {
        let scheduler = ManualScheduler()
        let hover = makeIntent(scheduler)
        var closed = 0
        hover.left(canClose: true) { closed += 1 }
        hover.entered(canOpen: false) {}
        scheduler.advance(by: 1)
        #expect(closed == 0)
    }

    @Test("aberta, confere o cursor periodicamente e recolhe sozinha uma vez")
    func openPollsAndAutoClosesOnce() {
        let scheduler = ManualScheduler()
        let hover = makeIntent(scheduler)
        var polls = 0
        var autoClosed = 0
        hover.opened(poll: { polls += 1 }, autoClose: { autoClosed += 1 })
        scheduler.advance(by: 0.12)
        #expect(polls == 2)
        scheduler.advance(by: 10)
        #expect(autoClosed == 1)
    }

    @Test("fechar para a conferência e o recolhimento automático")
    func closingStopsPollingAndAutoClose() {
        let scheduler = ManualScheduler()
        let hover = makeIntent(scheduler)
        var polls = 0
        var autoClosed = 0
        hover.opened(poll: { polls += 1 }, autoClose: { autoClosed += 1 })
        hover.closed()
        scheduler.advance(by: 10)
        #expect(polls == 0)
        #expect(autoClosed == 0)
    }

    @Test("sem recolhimento automático só confere o cursor")
    func withoutAutoCloseOnlyPolls() {
        let scheduler = ManualScheduler()
        let hover = makeIntent(scheduler)
        hover.opened(poll: {}, autoClose: nil)
        #expect(scheduler.armedIntervals.count == 1)
    }
}
