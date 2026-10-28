import Testing

@testable import FrodoCore

@Suite("springProgress")
struct SpringProgressTests {
    @Test("começa em 0 e termina exatamente em 1", arguments: [SpringSpec.standard, .soft, .firm])
    func startsAtZeroAndEndsAtOne(spring: SpringSpec) {
        #expect(springProgress(damping: spring.damping, at: 0) == 0)
        #expect(springProgress(damping: spring.damping, at: 1) == 1)
    }

    @Test("prende t fora de 0 a 1")
    func clampsTime() {
        #expect(springProgress(damping: SpringSpec.standard.damping, at: -0.5) == 0)
        #expect(springProgress(damping: SpringSpec.standard.damping, at: 2) == 1)
    }

    @Test("mola C passa uns 10% do alvo")
    func standardOvershootsAboutTenPercent() {
        #expect(abs(springPeak(damping: SpringSpec.standard.damping) - 1.107) < 0.005)
    }

    @Test("mola da ilha passa uns 5% do alvo")
    func gentleOvershootsAboutFivePercent() {
        #expect(abs(springPeak(damping: SpringSpec.gentle.damping) - 1.054) < 0.005)
    }

    @Test("mola leve quase não passa do alvo")
    func softBarelyOvershoots() {
        let peak = springPeak(damping: SpringSpec.soft.damping)
        #expect(peak > 1.01)
        #expect(peak < 1.03)
    }

    @Test("firme nunca passa do alvo e desacelera")
    func firmNeverOvershootsAndDecelerates() {
        #expect(springPeak(damping: SpringSpec.firm.damping) == 1)
        #expect(abs(springProgress(damping: SpringSpec.firm.damping, at: 0.5) - 0.875) < 0.0005)
    }
}

@Suite("springWithin")
struct SpringWithinTests {
    @Test("mantém a mola quando o quique cabe no teto")
    func keepsSpringWhenOvershootFits() {
        #expect(springWithin(.standard, from: 38, to: 700, ceiling: 800) == .standard)
    }

    @Test("troca por firme quando o quique passaria do teto")
    func fallsBackToFirmWhenOvershootExceedsCeiling() {
        #expect(springWithin(.standard, from: 38, to: 790, ceiling: 800) == SpringSpec(damping: 1, milliseconds: SpringSpec.standard.milliseconds))
    }

    @Test("encolher nunca passa do teto")
    func shrinkingNeverExceedsCeiling() {
        #expect(springWithin(.standard, from: 700, to: 38, ceiling: 700) == .standard)
    }
}
