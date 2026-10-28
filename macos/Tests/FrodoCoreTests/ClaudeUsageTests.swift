import Foundation
import Testing

@testable import FrodoCore

private let now = utc(2026, 10, 24, 12, 0)

private func iso(_ offsetSeconds: Double) -> String {
    Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(now.addingTimeInterval(offsetSeconds))
}

@Suite("normalizeWindows")
struct NormalizeWindowsTests {
    @Test("lê limits[] em ordem: sessão, semana e por modelo")
    func readsLimitsInOrder() {
        let windows = normalizeWindows(
            json(
                """
                {"limits": [
                  {"kind": "weekly_scoped", "group": "weekly", "percent": 80, "severity": "warning", "resets_at": "b",
                   "scope": {"model": {"display_name": "Opus"}}},
                  {"kind": "session", "group": "session", "percent": 62, "resets_at": "a", "is_active": true},
                  {"kind": "weekly_all", "group": "weekly", "percent": 31, "resets_at": "b"}
                ]}
                """
            )
        )
        #expect(windows.map(\.role) == [.session, .weekly, .scoped])
        #expect(windows.map(\.label) == ["5 horas", "7 dias", "7 dias Opus"])
        #expect(windows.map(\.utilization) == [62, 31, 80])
        #expect(windows.map(\.totalSeconds) == [18000, 604_800, 604_800])
        #expect(windows.map(\.apiLevel) == [.ok, .ok, .warn])
        #expect(windows[0].isActive)
    }

    @Test("lê o formato legado com janelas por modelo")
    func readsLegacyFormatWithPerModelWindows() {
        let windows = normalizeWindows(
            json(
                """
                {"five_hour": {"utilization": 10, "resets_at": "a"},
                 "seven_day": {"utilization": 20, "resets_at": "b"},
                 "seven_day_opus": {"utilization": 5, "resets_at": "b"}}
                """
            )
        )
        #expect(windows.map(\.role) == [.session, .weekly, .scoped])
        #expect(windows.map(\.label) == ["5 horas", "7 dias", "7 dias Opus"])
        #expect(windows.map(\.utilization) == [10, 20, 5])
    }

    @Test("descarta entradas sem porcentagem numérica")
    func discardsEntriesWithoutNumericPercent() {
        #expect(normalizeWindows(json(#"{"limits": [{"kind": "session", "percent": "x"}]}"#)).isEmpty)
        #expect(normalizeWindows(nil).isEmpty)
        #expect(normalizeWindows(.null).isEmpty)
    }
}

@Suite("normalizeSpend")
struct NormalizeSpendTests {
    @Test("lê o bloco spend estruturado")
    func readsStructuredSpendBlock() {
        let spend = normalizeSpend(
            json(
                """
                {"spend": {"enabled": true,
                  "used": {"amount_minor": 41654, "currency": "USD", "exponent": 2},
                  "limit": {"amount_minor": 100000, "currency": "USD", "exponent": 2},
                  "percent": 41.6, "severity": "warning"}}
                """
            )
        )
        #expect(spend == Spend(used: "USD 416.54", limit: "USD 1000.00", percent: 41.6, level: .warn))
    }

    @Test("cai para extra_usage")
    func fallsBackToExtraUsage() {
        let spend = normalizeSpend(
            json(
                """
                {"extra_usage": {"is_enabled": true, "used_credits": 1234, "monthly_limit": 5000,
                  "decimal_places": 2, "currency": "USD", "utilization": 24.68}}
                """
            )
        )
        #expect(spend == Spend(used: "USD 12.34", limit: "USD 50.00", percent: 25, level: .ok))
    }

    @Test("retorna nil sem uso extra")
    func returnsNilWithoutExtraUsage() {
        #expect(normalizeSpend(json(#"{"spend": {"enabled": false}, "extra_usage": {"is_enabled": false}}"#)) == nil)
    }
}

@Suite("ritmo e porcentagem")
struct PaceAndPercentTests {
    @Test("calcula o ritmo esperado da janela")
    func computesExpectedPace() {
        #expect(pacePercent(resetsAt: iso(9000), totalSeconds: 18000, now: now) == 50)
        #expect(pacePercent(resetsAt: iso(-10), totalSeconds: 18000, now: now) == nil)
        #expect(pacePercent(resetsAt: nil, totalSeconds: 18000, now: now) == nil)
    }

    @Test("mostra usado ou restante")
    func showsUsedOrRemaining() {
        #expect(shownPercent(62.4, remaining: false) == 62.4)
        #expect(shownPercent(62.4, remaining: true) == 38)
        #expect(shownPercent(120, remaining: true) == 0)
        #expect(shownPace(30, remaining: true) == 70)
        #expect(shownPace(nil, remaining: true) == nil)
    }
}

@Suite("plano da assinatura")
struct SubscriptionPlanTests {
    @Test("monta o rótulo com multiplicador")
    func buildsLabelWithMultiplier() {
        #expect(tierLabel(plan: "claude_max", rateLimitTier: "default_claude_max_20x") == "MAX 20x")
        #expect(tierLabel(plan: "pro", rateLimitTier: nil) == "PRO")
        #expect(tierLabel(plan: nil, rateLimitTier: nil) == "CLAUDE")
    }

    @Test("escolhe o ícone do plano")
    func picksPlanIcon() {
        #expect(tierIcon("MAX 20x") == .max)
        #expect(tierIcon("ENTERPRISE") == .enterprise)
        #expect(tierIcon("CLAUDE") == nil)
    }
}

@Suite("nível e projeção")
struct LevelAndProjectionTests {
    private func window(_ utilization: Double, _ remaining: Double, _ apiLevel: Level = .ok) -> LevelInput {
        LevelInput(utilization: utilization, resetsAt: iso(remaining), totalSeconds: 18000, apiLevel: apiLevel)
    }

    @Test("fica crítico quando vai acabar bem antes do reset")
    func criticalWhenRunningOutWellBeforeReset() {
        #expect(effectiveLevel(window(60, 9000), now: now) == .crit)
        #expect(projectionNote(window(60, 9000), remaining: false, now: now) == "ritmo alto: acaba em ~1h 40m")
    }

    @Test("avisa quando a projeção passa de 75%")
    func warnsWhenProjectionExceedsSeventyFivePercent() {
        #expect(effectiveLevel(window(50, 9000), now: now) == .warn)
        #expect(projectionNote(window(50, 9000), remaining: false, now: now) == "tendência de ~100% até o reset")
        #expect(projectionNote(window(50, 9000), remaining: true, now: now) == "tendência de ~0% restante até o reset")
    }

    @Test("fica calmo com uso baixo e respeita a severidade da API")
    func calmWithLowUsageAndRespectsApiSeverity() {
        #expect(effectiveLevel(window(20, 9000), now: now) == .ok)
        #expect(projectionNote(window(20, 9000), remaining: false, now: now) == "")
        #expect(effectiveLevel(window(10, 9000, .warn), now: now) == .warn)
        #expect(effectiveLevel(window(95, 9000), now: now) == .crit)
    }
}

@Suite("displayLevel")
struct DisplayLevelTests {
    private let laterNow = utc(2026, 10, 27, 12, 0)

    private func base(_ utilization: Double, _ apiLevel: Level = .ok) -> LevelInput {
        LevelInput(utilization: utilization, resetsAt: nil, totalSeconds: nil, apiLevel: apiLevel)
    }

    @Test("avisa a partir de 80%")
    func warnsFromEightyPercent() {
        #expect(displayLevel(base(86), now: laterNow) == .warn)
        #expect(displayLevel(base(62), now: laterNow) == .ok)
    }

    @Test("fica calmo abaixo de 80% e avisa em 80%")
    func calmBelowEightyAndWarnsAtEighty() {
        #expect(displayLevel(base(78), now: laterNow) == .ok)
        #expect(displayLevel(base(79), now: laterNow) == .ok)
        #expect(displayLevel(base(80), now: laterNow) == .warn)
    }

    @Test("respeita o aviso da API")
    func respectsApiWarning() {
        #expect(displayLevel(base(50, .warn), now: laterNow) == .warn)
    }

    @Test("mantém o crítico da API")
    func keepsApiCritical() {
        #expect(displayLevel(base(62, .crit), now: laterNow) == .crit)
    }
}

@Suite("tempos")
struct TimesTests {
    @Test("formata durações")
    func formatsDurations() {
        #expect(humanDuration(30) == "30s")
        #expect(humanDuration(600) == "10m")
        #expect(humanDuration(6000) == "1h 40m")
        #expect(humanDuration(200_000) == "2d 7h")
    }

    @Test("descreve o reset")
    func describesReset() {
        #expect(relativeReset(iso(0), now: now) == "reiniciando…")
        #expect(relativeReset(iso(45), now: now) == "reinicia em 45s")
        #expect(relativeReset(iso(1800), now: now) == "reinicia em 30m")
        #expect(relativeReset(iso(7800), now: now) == "reinicia em 2h 10m")
        #expect(relativeReset(iso(266_400), now: now) == "reinicia em 3d 2h")
        #expect(relativeReset(nil, now: now) == "")
    }
}

@Suite("conta e erros")
struct AccountAndErrorsTests {
    @Test("resume a conta a partir do perfil da API")
    func summarizesAccountFromApiProfile() {
        let max = accountSummary(
            json(
                """
                {"account": {"display_name": "Matheus", "has_claude_max": true},
                 "application": {"name": "Claude Code"},
                 "organization": {"subscription_status": "active", "rate_limit_tier": "default_claude_max_20x"}}
                """
            )
        )
        #expect(max == AccountSummary(who: "Matheus", plan: "max", rateLimitTier: "default_claude_max_20x", subtitle: "Matheus · Claude Code · ativo"))
        let team = accountSummary(json(#"{"account": {"full_name": "Ana", "has_claude_pro": true}, "organization": {"organization_type": "team"}}"#))
        #expect(team == AccountSummary(who: "Ana", plan: "team", rateLimitTier: nil, subtitle: "Ana · Claude"))
        #expect(accountSummary(nil) == nil)
    }

    @Test("descreve erros em português")
    func describesErrorsInPortuguese() {
        #expect(claudeErrorMessage(status: 401, apiMessage: nil) == "Sessão expirada. Entre de novo no Claude Code.")
        #expect(claudeErrorMessage(status: 403, apiMessage: "Sem plano") == "Sem plano")
        #expect(claudeErrorMessage(status: 403, apiMessage: nil) == "Sem assinatura ativa do Claude nesta conta.")
        #expect(claudeErrorMessage(status: 429, apiMessage: nil) == "Limite de requisições do Claude; tentando de novo em breve.")
        #expect(claudeErrorMessage(status: nil, apiMessage: nil) == "Não foi possível falar com o Claude.")
        #expect(claudeErrorMessage(status: 500, apiMessage: nil) == "Erro do Claude (HTTP 500).")
    }
}
