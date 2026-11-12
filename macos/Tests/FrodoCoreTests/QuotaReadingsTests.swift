import Foundation
import Testing

@testable import FrodoCore

private let now = utc(2026, 10, 29, 12, 0)

private func usageWindow(_ key: String, _ role: WindowRole, _ utilization: Double) -> UsageWindow {
    UsageWindow(key: key, label: key, role: role, utilization: utilization, resetsAt: nil, totalSeconds: nil, apiLevel: .ok, isActive: true)
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
