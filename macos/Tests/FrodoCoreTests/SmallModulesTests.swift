import Foundation
import Testing

@testable import FrodoCore

private let now = localDate(2026, 10, 28, 10, 0)
private let lead: TimeInterval = 10 * 60

private func meeting(_ offset: TimeInterval, duration: TimeInterval = 3600) -> MeetingEvent {
    MeetingEvent(summary: "em \(Int(offset * 1000))", date: now.addingTimeInterval(offset), end: now.addingTimeInterval(offset + duration))
}

@Suite("próxima reunião")
struct NextMeetingTests {
    @Test("sem eventos não há reunião")
    func noEventsNoMeeting() {
        #expect(nextMeeting([], now: now, lead: lead) == nil)
    }

    @Test("escolhe a que começa primeiro dentro da janela")
    func picksEarliestWithinWindow() {
        let events = [meeting(8 * 60), meeting(3 * 60), meeting(5 * 60)]
        #expect(nextMeeting(events, now: now, lead: lead) == Meeting(title: "em 180000", startsAt: now.addingTimeInterval(3 * 60)))
    }

    @Test("ignora a que já começou, inclusive no instante exato")
    func ignoresAlreadyStartedIncludingExactInstant() {
        #expect(nextMeeting([meeting(-60), meeting(0)], now: now, lead: lead) == nil)
        #expect(nextMeeting([meeting(-60), meeting(60)], now: now, lead: lead)?.startsAt == now.addingTimeInterval(60))
    }

    @Test("ignora a que começa depois da janela e aceita a do limite")
    func ignoresAfterWindowAndAcceptsBoundary() {
        #expect(nextMeeting([meeting(lead + 1)], now: now, lead: lead) == nil)
        #expect(nextMeeting([meeting(lead)], now: now, lead: lead)?.startsAt == now.addingTimeInterval(lead))
    }

    @Test("ignora evento de dia inteiro e aceita reunião que começa à meia-noite")
    func ignoresAllDayAndAcceptsMidnightMeeting() {
        let midnight = localDate(2026, 10, 29, 0, 0)
        let current = midnight.addingTimeInterval(-5 * 60)
        let allDay = MeetingEvent(summary: "Feriado", date: midnight, end: localDate(2026, 10, 30, 0, 0))
        let late = MeetingEvent(summary: "Plantão", date: midnight, end: localDate(2026, 10, 29, 1, 0))
        #expect(nextMeeting([allDay], now: current, lead: lead) == nil)
        #expect(nextMeeting([allDay, late], now: current, lead: lead) == Meeting(title: "Plantão", startsAt: midnight))
    }
}

@Suite("bateria e memória")
struct BatteryAndMemoryTests {
    @Test("escolhe o nível de bateria para o ícone")
    func picksBatteryLevel() {
        #expect(batteryLevel(BatteryInfo(percent: 95, charging: false)) == .full)
        #expect(batteryLevel(BatteryInfo(percent: 72, charging: false)) == .high)
        #expect(batteryLevel(BatteryInfo(percent: 40, charging: false)) == .medium)
        #expect(batteryLevel(BatteryInfo(percent: 15, charging: false)) == .low)
        #expect(batteryLevel(BatteryInfo(percent: 4, charging: false)) == .empty)
        #expect(batteryLevel(BatteryInfo(percent: 50, charging: true)) == .charging)
    }

    @Test("formata em GB com uma casa")
    func formatsGigabytes() {
        #expect(formatGb(6_657_199_308) == "6.2G")
    }
}

@Suite("abas")
struct TabsTests {
    @Test("mostra as não ocultas na ordem fixa")
    func showsNonHiddenInFixedOrder() {
        #expect(visibleTabs(hidden: []) == [.general, .calendar, .claude, .notifications])
        #expect(visibleTabs(hidden: [.calendar, .claude]) == [.general, .notifications])
    }

    @Test("nunca fica sem aba")
    func neverEndsWithoutTab() {
        #expect(visibleTabs(hidden: TabId.allCases) == [.general])
    }

    @Test("abre a primeira visível quando a pedida está oculta")
    func opensFirstVisibleWhenRequestedIsHidden() {
        #expect(tabToOpen(.claude, visible: [.general, .claude]) == .claude)
        #expect(tabToOpen(.claude, visible: [.calendar, .notifications]) == .calendar)
    }
}

@MainActor
@Suite("configurações")
struct FrodoSettingsTests {
    private func makeSettings() -> FrodoSettings {
        let suite = "frodo-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        return FrodoSettings(defaults: defaults)
    }

    @Test("valores padrão")
    func defaultValues() {
        let settings = makeSettings()
        #expect(settings.closedMode == .compact)
        #expect(settings.closedItems == [.clock, .date, .notifications, .battery])
        #expect(settings.rotateSeconds == 4)
        #expect(settings.monitors == .primary)
        #expect(settings.claudePollMinutes == 5)
        #expect(settings.openOnHover)
        #expect(!settings.autoClose)
        #expect(settings.hiddenTabs.isEmpty)
    }

    @Test("grava, lê e avisa a mudança")
    func writesReadsAndNotifiesChange() {
        let settings = makeSettings()
        var changedKeys: [String] = []
        _ = settings.changed.on { changedKeys.append($0) }
        settings.closedMode = .rotating
        settings.hiddenTabs = [.calendar]
        #expect(settings.closedMode == .rotating)
        #expect(settings.hiddenTabs == [.calendar])
        #expect(changedKeys == ["closed-mode", "hidden-tabs"])
    }

    @Test("limita números ao intervalo permitido")
    func clampsNumbersToAllowedRange() {
        let settings = makeSettings()
        settings.rotateSeconds = 99
        settings.claudePollMinutes = 0
        #expect(settings.rotateSeconds == 30)
        #expect(settings.claudePollMinutes == 1)
    }

    @Test("guarda perfis do Claude e ignora valores inválidos de enumeração")
    func storesClaudeProfilesAndIgnoresInvalidEnumValues() {
        let settings = makeSettings()
        settings.claudeProfiles = [ClaudeProfile(id: "a", label: "Trabalho", configDir: "/Users/u/.claude-trabalho")]
        #expect(settings.claudeProfiles == [ClaudeProfile(id: "a", label: "Trabalho", configDir: "/Users/u/.claude-trabalho")])
        settings.changed.clearListeners()
        UserDefaults.standard.removeObject(forKey: "frodo-test-invalid")
    }

    @Test("avisa só as chaves pedidas")
    func notifiesOnlyRequestedKeys() {
        let settings = makeSettings()
        var calls = 0
        _ = settings.onChanged(["closed-mode"]) { calls += 1 }
        settings.autoClose = true
        settings.closedMode = .minimal
        #expect(calls == 1)
    }
}
