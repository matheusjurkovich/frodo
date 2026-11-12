import FrodoCore
import FrodoPlatform
import Foundation

@MainActor
final class DoneAlert: Destroyable {
    private let settings: FrodoSettings
    private let sessions: ClaudeSessions
    private let notifications: NotificationsStore
    private let disposables = Disposables()
    private var previous: [SessionState]

    init(settings: FrodoSettings, sessions: ClaudeSessions, notifications: NotificationsStore) {
        self.settings = settings
        self.sessions = sessions
        self.notifications = notifications
        previous = sessions.sessions
        disposables.add(sessions.changed.on { [weak self] _ in self?.check() })
    }

    private func check() {
        let next = sessions.sessions
        let finished = finishedSessions(previous, next)
        previous = next
        guard settings.notifyDone else { return }
        for state in finished {
            notifications.push(app: state.provider.name, title: "Pronto", body: doneMessage(state), provider: state.provider)
        }
    }

    func destroy() {
        disposables.dispose()
    }
}

@MainActor
final class QuotaAlerts: Destroyable {
    private let settings: FrodoSettings
    private let claude: ClaudeService
    private let codex: CodexService
    private let gemini: GeminiService
    private let notifications: NotificationsStore
    private let disposables = Disposables()
    private var states: [String: FrodoLevel] = [:]

    init(settings: FrodoSettings, claude: ClaudeService, codex: CodexService, gemini: GeminiService, notifications: NotificationsStore) {
        self.settings = settings
        self.claude = claude
        self.codex = codex
        self.gemini = gemini
        self.notifications = notifications
        for changed in [claude.changed, codex.changed, gemini.changed] {
            disposables.add(changed.on { [weak self] _ in self?.check() })
        }
        check()
    }

    private func check() {
        let now = Date()
        let readings = quotaReadings(
            claude: claude.active.map { (configDir: $0.profile.configDir, windows: $0.windows) },
            codex: codex.meters(now: now),
            gemini: gemini.meters(now: now),
            enabled: { [settings] in settings.providerEnabled($0) }
        )
        let result = quotaNotices(states, readings)
        states = result.states
        guard settings.notifyQuota else { return }
        for notice in result.notices {
            notifications.push(app: notice.provider.name, title: notice.title, body: notice.body, provider: notice.provider)
        }
    }

    func destroy() {
        disposables.dispose()
    }
}

@MainActor
final class MemoryAlert: Destroyable {
    private let system: SystemState
    private let notifications: NotificationsStore
    private let disposables = Disposables()
    private var alarmed = false

    init(system: SystemState, notifications: NotificationsStore) {
        self.system = system
        self.notifications = notifications
        disposables.add(system.memory.on { [weak self] _ in self?.check() })
    }

    private func check() {
        guard let memory = system.memoryInfo else { return }
        let next = memoryAlarm(usedPercent(memory), alarmed: alarmed)
        if next && !alarmed { notifications.push(app: "Frodo", title: "Memória alta", body: highMemoryMessage(memory)) }
        alarmed = next
    }

    func destroy() {
        disposables.dispose()
    }
}
