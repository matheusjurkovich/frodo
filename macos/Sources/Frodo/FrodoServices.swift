import AppKit
import FrodoCore
import FrodoPlatform
import Observation

@MainActor
private final class NoRecording: RecordingSource {
    let startedAt: Date? = nil
    let changed = Event<Void>()
}

@MainActor
@Observable
final class Revisions {
    var claude = 0
    var sessions = 0
    var transcripts = 0
    var calendar = 0
    var system = 0
    var media = 0
    var notifications = 0
    var apps = 0
    var volume = 0
    var feed = 0
    var settings = 0
}

@MainActor
final class FrodoServices {
    let paths: FrodoPaths
    let scheduler = SystemScheduler()
    let settings: FrodoSettings
    let revisions = Revisions()
    let notifications = NotificationsStore()
    let sessions: ClaudeSessions
    let claude: ClaudeService
    let transcripts: ClaudeTranscripts
    let system: SystemState
    let volume = VolumeService()
    let calendar: CalendarService
    let media = MediaService()
    let apps = RunningApps()
    let feed: ActivityFeed
    let hotkeys = GlobalHotkeys()
    let runner = ProcessCommandRunner()
    private let disposables = Disposables()

    init(paths: FrodoPaths, defaults: UserDefaults, store: any CredentialStore, transport: @escaping Transport) {
        self.paths = paths
        settings = FrodoSettings(defaults: defaults)
        sessions = ClaudeSessions(settings: settings, paths: paths, scheduler: scheduler)
        claude = ClaudeService(settings: settings, store: store, transport: transport, paths: paths, scheduler: scheduler)
        transcripts = ClaudeTranscripts(settings: settings, cachePath: paths.indexCacheFile, scheduler: scheduler)
        system = SystemState(scheduler: scheduler)
        calendar = CalendarService(settings: settings, scheduler: scheduler)
        let sources = FeedSources(
            recording: NoRecording(), sessions: sessions, meetings: calendar, notifications: notifications, volume: volume, media: media
        )
        feed = ActivityFeed(sources: sources, scheduler: scheduler)
        bridge()
    }

    static func live() -> FrodoServices {
        let paths = FrodoPaths.live()
        let store = FallbackCredentialStore([KeychainCredentialStore(defaultConfigDir: paths.defaultClaudeConfigDir), FileCredentialStore()])
        return FrodoServices(paths: paths, defaults: .standard, store: store, transport: urlSessionTransport())
    }

    private func bridge() {
        let revisions = revisions
        Surface.shared.style = settings.surfaceStyle
        disposables.add(settings.onChanged(["surface-style"]) { [settings] in Surface.shared.style = settings.surfaceStyle })
        disposables.add(claude.changed.on { _ in revisions.claude += 1 })
        disposables.add(sessions.changed.on { _ in revisions.sessions += 1 })
        disposables.add(transcripts.changed.on { _ in revisions.transcripts += 1 })
        disposables.add(calendar.changed.on { _ in revisions.calendar += 1 })
        disposables.add(system.battery.on { _ in revisions.system += 1 })
        disposables.add(system.memory.on { _ in revisions.system += 1 })
        disposables.add(media.changed.on { _ in revisions.media += 1 })
        disposables.add(notifications.changed.on { _ in revisions.notifications += 1 })
        disposables.add(apps.changed.on { _ in revisions.apps += 1 })
        disposables.add(volume.changed.on { _ in revisions.volume += 1 })
        disposables.add(feed.changed.on { _ in revisions.feed += 1 })
        disposables.add(settings.changed.on { _ in revisions.settings += 1 })
        disposables.add(sessions.hookEvents.on { [weak self] event in
            guard event.notificationType == "idle_prompt", let message = claudeNotification(for: event) else { return }
            self?.notifications.push(app: "Claude Code", title: message.title, body: message.body)
        })
    }

    func installHookIfPossible() -> String? {
        try? installHook(paths: paths)
    }

    func destroy() {
        hotkeys.destroy()
        feed.destroy()
        sessions.destroy()
        claude.destroy()
        transcripts.destroy()
        system.destroy()
        volume.destroy()
        calendar.destroy()
        media.destroy()
        apps.destroy()
        notifications.destroy()
        disposables.dispose()
    }
}
