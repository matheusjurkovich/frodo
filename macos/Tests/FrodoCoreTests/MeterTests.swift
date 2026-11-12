import Foundation
import Testing

@testable import FrodoCore

private let now = localDate(2026, 10, 28, 10, 0)

@Suite("medidores de cota")
struct MeterTests {
    @Test("classifica o nível pelo uso")
    func level() {
        #expect(meterLevel(10) == .ok)
        #expect(meterLevel(80) == .warn)
        #expect(meterLevel(97) == .crit)
    }

    @Test("descreve quando a cota reinicia")
    func note() {
        #expect(resetNote(now.addingTimeInterval(-0.001), now: now) == "Reiniciada")
        #expect(resetNote(now.addingTimeInterval(20 * 60), now: now) == "Reinicia em 20 min")
        #expect(resetNote(now.addingTimeInterval(130 * 60), now: now) == "Reinicia em 2 h 10 min")
        #expect(resetNote(now.addingTimeInterval(3 * 3600), now: now) == "Reinicia em 3 h")
        #expect(resetNote(localDate(2026, 10, 31, 14, 0), now: now) == "Reinicia sábado, 14:00")
    }

    @Test("mostra o restante quando pedido")
    func shown() {
        #expect(shownMeterPercent(30, remaining: false) == 30)
        #expect(shownMeterPercent(30, remaining: true) == 70)
        #expect(shownMeterPercent(140, remaining: false) == 100)
    }
}

private func claude(_ percent: Double) -> QuotaReading {
    QuotaReading(id: "claude:/c:session", provider: .claude, name: "Claude", window: "5 h", percent: percent)
}

@Suite("avisos de cota")
struct QuotaNoticesTests {
    @Test("primeira leitura só registra, sem aviso")
    func first() {
        let result = quotaNotices([:], [claude(90)])
        #expect(result.notices.isEmpty)
        #expect(result.states["claude:/c:session"] == .warn)
    }

    @Test("cruzar 80% avisa uma vez")
    func crossing() {
        let first = quotaNotices(["claude:/c:session": .ok], [claude(82)])
        #expect(first.notices == [AlertNotice(provider: .claude, title: "Cota em 80%", body: "Claude: 80% da cota de 5 h")])
        #expect(quotaNotices(first.states, [claude(85)]).notices.isEmpty)
    }

    @Test("pular de 70% para 97% avisa só o de 95%")
    func jump() {
        #expect(
            quotaNotices(["claude:/c:session": .ok], [claude(97)]).notices
                == [AlertNotice(provider: .claude, title: "Cota em 95%", body: "Claude: 95% da cota de 5 h")]
        )
    }

    @Test("cair de 96% para 90% não repete aviso")
    func falling() {
        let fell = quotaNotices(["claude:/c:session": .crit], [claude(90)])
        #expect(fell.notices.isEmpty)
        #expect(quotaNotices(fell.states, [claude(96)]).notices.isEmpty)
    }

    @Test("voltar abaixo de 80% depois de alerta avisa cota renovada")
    func renewed() {
        let codex = QuotaReading(id: "codex:weekly", provider: .codex, name: "Codex", window: "semana", percent: 12)
        let result = quotaNotices(["codex:weekly": .warn], [codex])
        #expect(result.notices == [AlertNotice(provider: .codex, title: "Cota renovada", body: "Codex: cota de semana renovada")])
        #expect(result.states["codex:weekly"] == .ok)
    }

    @Test("janela do codex expirada (0%) depois de alerta vira renovada")
    func expired() {
        let expired = QuotaReading(id: "codex:session", provider: .codex, name: "Codex", window: "5 h", percent: 0)
        #expect(
            quotaNotices(["codex:session": .crit], [expired]).notices
                == [AlertNotice(provider: .codex, title: "Cota renovada", body: "Codex: cota de 5 h renovada")]
        )
    }

    @Test("medidor que some é esquecido e volta como primeira leitura")
    func forgotten() {
        let other = QuotaReading(id: "claude:/outro:session", provider: .claude, name: "Claude", window: "5 h", percent: 10)
        let switched = quotaNotices(["claude:/c:session": .crit], [other])
        #expect(switched.notices.isEmpty)
        #expect(switched.states["claude:/c:session"] == nil)
        #expect(quotaNotices(switched.states, [claude(96)]).notices.isEmpty)
    }
}
