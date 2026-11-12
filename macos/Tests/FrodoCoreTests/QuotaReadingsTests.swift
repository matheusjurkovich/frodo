import Foundation
import Testing

@testable import FrodoCore

private let now = utc(2026, 10, 29, 12, 0)

private func usageWindow(_ key: String, _ role: WindowRole, _ utilization: Double) -> UsageWindow {
    UsageWindow(key: key, label: key, role: role, utilization: utilization, resetsAt: nil, totalSeconds: nil, apiLevel: .ok, isActive: true)
}

private func claudeUsage(_ session: Double, _ weekly: Double = 0) -> (configDir: String, windows: [UsageWindow]) {
    (configDir: "/c", windows: [usageWindow("session", .session, session), usageWindow("weekly", .weekly, weekly)])
}

private func codexUsage(_ primary: Double, resetsAt: Date = now.addingTimeInterval(3600)) -> [Meter] {
    codexMeters(CodexLimits(plan: nil, primary: RateWindow(usedPercent: primary, windowMinutes: 300, resetsAt: resetsAt), secondary: nil, at: now), now: now)
}

private func geminiUsage(_ requests: Int) -> [Meter] {
    geminiMeters(GeminiQuota(requests: requests, limit: 100, perMinute: 0, resetsAt: now.addingTimeInterval(3600)))
}

private struct QuotaWatch {
    var states: [String: Level] = [:]
    var claude: (configDir: String, windows: [UsageWindow])?
    var codex: [Meter] = []
    var gemini: [Meter] = []
    var disabled: Set<AiProvider> = []

    mutating func check() -> [QuotaNotice] {
        let result = quotaNotices(states, quotaReadings(claude: claude, codex: codex, gemini: gemini, enabled: { [disabled] in !disabled.contains($0) }))
        states = result.states
        return result.notices
    }

    mutating func readClaude(_ session: Double, _ weekly: Double = 0) -> [QuotaNotice] {
        claude = claudeUsage(session, weekly)
        return check()
    }
}

private func notice(_ provider: AiProvider, _ title: String, _ body: String) -> QuotaNotice {
    QuotaNotice(provider: provider, title: title, body: body)
}

@Suite("leituras de cota")
struct QuotaReadingsTests {
    @Test("duas janelas semanais do Claude geram uma leitura só, a primeira, como na pílula")
    func claudeTakesFirstWindowPerRole() {
        let readings = quotaReadings(
            claude: (
                configDir: "/c",
                windows: [
                    usageWindow("five_hour", .session, 10), usageWindow("seven_day", .weekly, 85), usageWindow("seven_day_fable", .weekly, 0),
                ]
            ),
            codex: [],
            gemini: [],
            enabled: { _ in true }
        )
        #expect(
            readings == [
                QuotaReading(id: "claude:/c:session", provider: .claude, name: "Claude", window: "5 h", percent: 10),
                QuotaReading(id: "claude:/c:weekly", provider: .claude, name: "Claude", window: "semana", percent: 85),
            ]
        )
    }

    @Test("codex e gemini entram com as janelas que a pílula mostra")
    func codexAndGeminiUsePillWindows() {
        let codex = codexMeters(
            CodexLimits(
                plan: nil,
                primary: RateWindow(usedPercent: 42, windowMinutes: 300, resetsAt: now.addingTimeInterval(3600)),
                secondary: RateWindow(usedPercent: 81, windowMinutes: 10080, resetsAt: now.addingTimeInterval(86400)),
                at: now
            ),
            now: now
        )
        let gemini = geminiMeters(GeminiQuota(requests: 900, limit: 1000, perMinute: 59, resetsAt: now.addingTimeInterval(3600)))
        #expect(
            quotaReadings(claude: nil, codex: codex, gemini: gemini, enabled: { _ in true }) == [
                QuotaReading(id: "codex:session", provider: .codex, name: "Codex", window: "5 h", percent: 42),
                QuotaReading(id: "codex:weekly", provider: .codex, name: "Codex", window: "semana", percent: 81),
                QuotaReading(id: "gemini:daily", provider: .gemini, name: "Gemini", window: "dia", percent: 90),
            ]
        )
    }

    @Test("provedor desligado não entra")
    func disabledProviderIsLeftOut() {
        let readings = quotaReadings(
            claude: (configDir: "/c", windows: [usageWindow("five_hour", .session, 90)]),
            codex: [],
            gemini: geminiMeters(GeminiQuota(requests: 900, limit: 1000, perMinute: 0, resetsAt: now)),
            enabled: { $0 != .claude }
        )
        #expect(readings.map(\.id) == ["gemini:daily"])
    }
}

@Suite("avisos de cota ao longo das leituras")
struct QuotaAlertsTests {
    @Test("a primeira leitura só guarda o nível, mesmo acima do limite")
    func firstReadingOnlyStores() {
        var watch = QuotaWatch()
        #expect(watch.readClaude(97, 85).isEmpty)
        #expect(watch.states["claude:/c:session"] == .crit)
        #expect(watch.states["claude:/c:weekly"] == .warn)
    }

    @Test("avisa ao cruzar 80% e 95% e quando a cota renova")
    func crossesAndRenews() {
        var watch = QuotaWatch()
        let notices = [10, 80, 85, 95, 5].flatMap { watch.readClaude(Double($0)) }
        #expect(
            notices == [
                notice(.claude, "Cota em 80%", "Claude: 80% da cota de 5 h"),
                notice(.claude, "Cota em 95%", "Claude: 95% da cota de 5 h"),
                notice(.claude, "Cota renovada", "Claude: cota de 5 h renovada"),
            ]
        )
    }

    @Test("cota renovada avisa uma vez só")
    func renewedOnlyOnce() {
        var watch = QuotaWatch()
        let notices = [10, 90, 5, 3, 0].flatMap { watch.readClaude(Double($0)) }
        #expect(notices.filter { $0.title == "Cota renovada" }.count == 1)
    }

    @Test("descer de 95% para 80% não avisa nem rearma o aviso de 95%")
    func fallingDoesNotRearm() {
        var watch = QuotaWatch()
        let notices = [10, 96, 85, 96].flatMap { watch.readClaude(Double($0)) }
        #expect(notices.count == 1)
    }

    @Test("acompanha cada janela e cada provedor em separado")
    func tracksEachWindowAndProvider() {
        var watch = QuotaWatch()
        _ = watch.readClaude(10, 10)
        watch.codex = codexUsage(10)
        _ = watch.check()
        watch.gemini = geminiUsage(10)
        _ = watch.check()
        var notices = watch.readClaude(10, 90)
        watch.codex = codexUsage(81)
        notices += watch.check()
        watch.gemini = geminiUsage(96)
        notices += watch.check()
        #expect(
            notices == [
                notice(.claude, "Cota em 80%", "Claude: 80% da cota de semana"),
                notice(.codex, "Cota em 80%", "Codex: 80% da cota de 5 h"),
                notice(.gemini, "Cota em 95%", "Gemini: 95% da cota de dia"),
            ]
        )
    }

    @Test("janela do Codex que já reiniciou conta como renovada")
    func expiredCodexWindowRenews() {
        var watch = QuotaWatch()
        watch.codex = codexUsage(90)
        _ = watch.check()
        watch.codex = codexUsage(90, resetsAt: now.addingTimeInterval(-1))
        #expect(watch.check() == [notice(.codex, "Cota renovada", "Codex: cota de 5 h renovada")])
    }

    @Test("com o aviso desligado não notifica, mas segue o nível")
    func silencedNoticesStillAdvanceLevel() {
        var watch = QuotaWatch()
        _ = watch.readClaude(10)
        _ = watch.readClaude(90)
        #expect(watch.readClaude(90).isEmpty)
    }

    @Test("ignora provedor desligado e recomeça do zero quando ele volta")
    func disabledProviderRestartsFromScratch() {
        var watch = QuotaWatch()
        _ = watch.readClaude(10)
        watch.disabled = [.claude]
        #expect(watch.readClaude(90).isEmpty)
        watch.disabled = []
        #expect(watch.readClaude(90).isEmpty)
        #expect(watch.readClaude(96) == [notice(.claude, "Cota em 95%", "Claude: 95% da cota de 5 h")])
    }
}
