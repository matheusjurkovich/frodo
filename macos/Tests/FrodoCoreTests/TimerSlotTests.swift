import Testing

@testable import FrodoCore

@MainActor
@Suite("TimerSlot")
struct TimerSlotTests {
    @Test("dispara uma vez depois do atraso")
    func firesOnceAfterDelay() {
        let scheduler = ManualScheduler()
        let slot = TimerSlot(scheduler: scheduler)
        var fired = 0
        var activeInsideCallback = true
        slot.once(0.01) {
            fired += 1
            activeInsideCallback = slot.active
        }
        #expect(slot.active)
        scheduler.advance(by: 0.005)
        #expect(fired == 0)
        scheduler.advance(by: 0.005)
        #expect(fired == 1)
        #expect(!activeInsideCallback)
        #expect(!slot.active)
        scheduler.advance(by: 1)
        #expect(fired == 1)
    }

    @Test("cancela antes de disparar")
    func cancelsBeforeFiring() {
        let scheduler = ManualScheduler()
        let slot = TimerSlot(scheduler: scheduler)
        var fired = 0
        slot.once(0.01) { fired += 1 }
        slot.stop()
        scheduler.advance(by: 1)
        #expect(fired == 0)
        #expect(!slot.active)
    }

    @Test("rearmar descarta o anterior")
    func rearmingDiscardsThePrevious() {
        let scheduler = ManualScheduler()
        let slot = TimerSlot(scheduler: scheduler)
        var fired: [String] = []
        slot.once(3) { fired.append("primeiro") }
        slot.once(1.5) { fired.append("segundo") }
        #expect(scheduler.armedIntervals == [1.5])
        scheduler.advance(by: 5)
        #expect(fired == ["segundo"])
    }

    @Test("every repete até parar")
    func everyRepeatsUntilStopped() {
        let scheduler = ManualScheduler()
        let slot = TimerSlot(scheduler: scheduler)
        var ticks = 0
        slot.every(1) { ticks += 1 }
        scheduler.advance(by: 3)
        #expect(ticks == 3)
        #expect(slot.active)
        slot.stop()
        scheduler.advance(by: 3)
        #expect(ticks == 3)
    }

    @Test("o agendador do sistema dispara no run loop principal")
    func systemSchedulerFiresOnMainRunLoop() async {
        let slot = TimerSlot(scheduler: SystemScheduler())
        await confirmation { fired in
            slot.once(0.01) { fired() }
            try? await Task.sleep(for: .milliseconds(150))
        }
        #expect(!slot.active)
    }
}
