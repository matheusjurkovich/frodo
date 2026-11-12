import Foundation
import Testing

@testable import FrodoCore

private let now = utc(2026, 10, 29, 12, 0)

private func usageWindow(_ key: String, _ role: WindowRole, _ utilization: Double) -> UsageWindow {
    UsageWindow(key: key, label: key, role: role, utilization: utilization, resetsAt: nil, totalSeconds: nil, apiLevel: .ok, isActive: true)
}

private func codexUsage(_ primary: Double, resetsAt: Date = now.addingTimeInterval(3600)) -> [Meter] {
    codexMeters(CodexLimits(plan: nil, primary: RateWindow(usedPercent: primary, windowMinutes: 300, resetsAt: resetsAt), secondary: nil, at: now), now: now)
}

private func geminiUsage(_ requests: Int) -> [Meter] {
    geminiMeters(GeminiQuota(requests: requests, limit: 100, perMinute: 0, resetsAt: now.addingTimeInterval(3600)))
}

private struct QuotaWatch {
    var alerts = QuotaAlertState()
    var claude: (configDir: String, windows: [UsageWindow])?
    var codex: [Meter] = []
    var gemini: [Meter] = []
    var disabled: Set<AiProvider> = []
    var notify = true

    mutating func check() -> [AlertNotice] {
        alerts.check(quotaReadings(claude: claude, codex: codex, gemini: gemini, enabled: { [disabled] in !disabled.contains($0) }), notify: notify)
    }

    mutating func readClaude(_ session: Double, _ weekly: Double = 0) -> [AlertNotice] {
        claude = (configDir: "/c", windows: [usageWindow("session", .session, session), usageWindow("weekly", .weekly, weekly)])
        return check()
    }

    mutating func readCodex(_ primary: Double, resetsAt: Date = now.addingTimeInterval(3600)) -> [AlertNotice] {
        codex = codexUsage(primary, resetsAt: resetsAt)
        return check()
    }

    mutating func readGemini(_ requests: Int) -> [AlertNotice] {
        gemini = geminiUsage(requests)
        return check()
    }
}

private func notice(_ provider: AiProvider, _ title: String, _ body: String) -> AlertNotice {
    AlertNotice(provider: provider, title: title, body: body)
}

@Suite("QuotaAlerts")
struct QuotaAlertStateTests {
    @Test("a primeira leitura só guarda o nível, mesmo acima do limite")
    func firstReadingOnlyStores() {
        var watch = QuotaWatch()
        #expect(watch.readClaude(97, 85).isEmpty)
        #expect(watch.alerts.levels["claude:/c:session"] == .crit)
        #expect(watch.alerts.levels["claude:/c:weekly"] == .warn)
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
        _ = watch.readCodex(10)
        _ = watch.readGemini(10)
        let notices = watch.readClaude(10, 90) + watch.readCodex(81) + watch.readGemini(96)
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
        let notices = watch.readCodex(90) + watch.readCodex(90, resetsAt: now.addingTimeInterval(-1))
        #expect(notices == [notice(.codex, "Cota renovada", "Codex: cota de 5 h renovada")])
    }

    @Test("com o aviso desligado não notifica, mas segue o nível")
    func silencedNoticesStillAdvanceLevel() {
        var watch = QuotaWatch()
        _ = watch.readClaude(10)
        watch.notify = false
        #expect(watch.readClaude(90).isEmpty)
        #expect(watch.alerts.levels["claude:/c:session"] == .warn)
        watch.notify = true
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

private func doneSession(_ sessionId: String, _ status: SessionStatus, provider: AiProvider = .claude) -> SessionState {
    makeSession(sessionId, status: status, repo: sessionId, provider: provider)
}

@Suite("DoneAlert")
struct DoneAlertStateTests {
    @Test("avisa quando uma sessão que trabalhava termina, com o provedor e o repositório")
    func notifiesFinishedSessionWithProviderAndRepo() {
        var alert = DoneAlertState([doneSession("a", .working)])
        #expect(alert.next([doneSession("a", .done)], notify: true) == [notice(.claude, "Pronto", "Claude terminou em a")])
    }

    @Test("não avisa de novo enquanto a sessão segue pronta")
    func doesNotRepeatWhileDone() {
        var alert = DoneAlertState([doneSession("a", .working)])
        let notices = alert.next([doneSession("a", .done)], notify: true) + alert.next([doneSession("a", .done)], notify: true)
        #expect(notices.count == 1)
    }

    @Test("não avisa sessão que já aparece pronta ou que só passa a esperar")
    func ignoresAlreadyDoneOrWaiting() {
        var alert = DoneAlertState([doneSession("a", .working)])
        let first = alert.next([doneSession("a", .waiting), doneSession("b", .done, provider: .codex)], notify: true)
        let second = alert.next([doneSession("a", .done), doneSession("b", .done, provider: .codex)], notify: true)
        #expect((first + second).isEmpty)
    }

    @Test("avisa cada sessão que termina no mesmo lote")
    func notifiesEachFinishedInBatch() {
        var alert = DoneAlertState([doneSession("a", .working)])
        _ = alert.next([doneSession("a", .working), doneSession("b", .working, provider: .gemini)], notify: true)
        let notices = alert.next([doneSession("a", .done), doneSession("b", .done, provider: .gemini)], notify: true)
        #expect(notices == [notice(.claude, "Pronto", "Claude terminou em a"), notice(.gemini, "Pronto", "Gemini terminou em b")])
    }

    @Test("com o aviso desligado não notifica, mas segue o estado")
    func silencedNoticesStillAdvanceState() {
        var alert = DoneAlertState([doneSession("a", .working)])
        #expect(alert.next([doneSession("a", .done)], notify: false).isEmpty)
        #expect(alert.next([doneSession("a", .done)], notify: true).isEmpty)
    }
}

private let totalMemory: UInt64 = 16 * 1_073_741_824

private func used(_ percent: UInt64) -> MemoryInfo {
    MemoryInfo(totalBytes: totalMemory, usedBytes: totalMemory * percent / 100)
}

private func memoryAlerts(_ readings: MemoryInfo?...) -> [String] {
    var alarm = MemoryAlarmState()
    return readings.compactMap { alarm.next($0) }
}

@Suite("MemoryAlert")
struct MemoryAlarmStateTests {
    @Test("avisa uma vez só quando a RAM passa do limite")
    func alertsOnce() {
        #expect(memoryAlerts(used(85)).isEmpty)
        #expect(memoryAlerts(used(85), used(92), used(95)) == ["92% da RAM em uso (14.7G de 16.0G)"])
    }

    @Test("rearma só depois de cair abaixo do limite de rearme")
    func rearmsBelowThreshold() {
        #expect(memoryAlerts(used(92), used(85), used(92)).count == 1)
        #expect(memoryAlerts(used(92), used(85), used(92), used(70), used(91)).count == 2)
    }

    @Test("leitura que falha não muda o estado")
    func failedReadingKeepsState() {
        #expect(memoryAlerts(used(92), nil, used(92)).count == 1)
    }
}
