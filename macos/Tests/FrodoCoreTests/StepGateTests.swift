import Foundation
import Testing

@testable import FrodoCore

private func at(_ seconds: TimeInterval) -> Date {
    Date(timeIntervalSince1970: seconds)
}

@Suite("StepGate")
struct StepGateTests {
    @Test("primeiro passo de uma sessão é admitido")
    func firstStepIsAdmitted() {
        let gate = StepGate()
        #expect(gate.admits("a", step: "Edit x.ts", now: at(0)))
    }

    @Test("o mesmo passo repete a decisão")
    func sameStepRepeatsTheDecision() {
        let gate = StepGate()
        _ = gate.admits("a", step: "Edit x.ts", now: at(0))
        gate.shown("a", now: at(0))
        #expect(gate.admits("a", step: "Edit x.ts", now: at(1)))
    }

    @Test("passo novo dentro de 10 s do último mostrado é recusado e não volta depois")
    func newStepWithinQuietWindowIsRefusedForGood() {
        let gate = StepGate()
        _ = gate.admits("a", step: "Edit x.ts", now: at(0))
        gate.shown("a", now: at(0))
        #expect(!gate.admits("a", step: "Edit y.ts", now: at(4)))
        #expect(!gate.admits("a", step: "Edit y.ts", now: at(20)))
    }

    @Test("passo novo depois de 10 s é admitido")
    func newStepAfterQuietWindowIsAdmitted() {
        let gate = StepGate()
        _ = gate.admits("a", step: "Edit x.ts", now: at(0))
        gate.shown("a", now: at(0))
        #expect(gate.admits("a", step: "Edit z.ts", now: at(10)))
    }

    @Test("a janela conta de quando apareceu, não do evento")
    func windowCountsFromWhenShown() {
        let gate = StepGate()
        _ = gate.admits("a", step: "Edit x.ts", now: at(0))
        gate.shown("a", now: at(8))
        #expect(!gate.admits("a", step: "Edit y.ts", now: at(12)))
    }

    @Test("sessões têm janelas independentes")
    func sessionsHaveIndependentWindows() {
        let gate = StepGate()
        _ = gate.admits("a", step: "Edit x.ts", now: at(0))
        gate.shown("a", now: at(0))
        #expect(gate.admits("b", step: "Edit y.ts", now: at(1)))
    }

    @Test("retain esquece sessões encerradas")
    func retainForgetsEndedSessions() {
        let gate = StepGate()
        _ = gate.admits("a", step: "Edit x.ts", now: at(0))
        gate.shown("a", now: at(0))
        gate.retain([])
        #expect(gate.admits("a", step: "Edit y.ts", now: at(1)))
    }
}
