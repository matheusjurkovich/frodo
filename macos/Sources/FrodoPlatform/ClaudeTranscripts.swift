import FrodoCore
import Foundation

private let scanSeconds: TimeInterval = 30

@MainActor
public final class ClaudeTranscripts: Destroyable {
    public let changed = Event<Void>()
    public private(set) var index = ClaudeIndex()
    public private(set) var scanning = false

    private let settings: FrodoSettings
    private let scanner: TranscriptScanner
    private let timer: TimerSlot
    private var wanted = 0
    private var running: Task<Void, Never>?
    private var destroyed = false

    public init(settings: FrodoSettings, cachePath: String, scheduler: Scheduler) {
        self.settings = settings
        scanner = TranscriptScanner(cachePath: cachePath)
        timer = TimerSlot(scheduler: scheduler)
    }

    public func setWanted(_ isWanted: Bool) {
        if destroyed { return }
        let before = wanted
        wanted = max(0, before + (isWanted ? 1 : -1))
        if wanted == 0 {
            timer.stop()
            if before > 0 { Task { await scanner.flush() } }
            return
        }
        if before > 0 { return }
        timer.every(scanSeconds) { [weak self] in Task { await self?.scan() } }
        Task { await scan() }
    }

    public func scan() async {
        if let running {
            await running.value
            return
        }
        let dirs = settings.claudeProfiles.map(\.configDir)
        let isWanted = wanted > 0
        scanning = true
        changed.emit()
        let task = Task { @MainActor [scanner] in
            let result = await scanner.scan(configDirs: dirs, now: Date(), wanted: isWanted)
            if !destroyed { index = result }
        }
        running = task
        await task.value
        running = nil
        scanning = false
        if !destroyed { changed.emit() }
    }

    public func destroy() {
        destroyed = true
        timer.stop()
        Task { await scanner.flush() }
        changed.clearListeners()
    }
}
