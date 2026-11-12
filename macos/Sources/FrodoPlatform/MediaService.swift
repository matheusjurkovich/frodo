import AppKit
import FrodoCore
import Foundation

private let progressSeconds: TimeInterval = 1

private struct Player: Sendable {
    let bundleId: String
    let progressScript: String
}

private let players: [String: Player] = [
    "Music": Player(bundleId: "com.apple.Music", progressScript: "tell application \"Music\" to {player position, duration of current track}"),
    "Spotify": Player(
        bundleId: "com.spotify.client",
        progressScript: "tell application \"Spotify\" to {player position, (duration of current track) / 1000, artwork url of current track}"
    ),
]

private struct PlayerProgress: Sendable {
    let position: Double?
    let duration: Double?
    let artwork: URL?
}

@MainActor
public final class MediaService: MediaSource, Destroyable {
    public let changed = Event<Void>()
    public let progressChanged = Event<Void>()
    public private(set) var current: MediaTrack?
    public private(set) var automationDenied = false
    public private(set) var position: Double?
    public private(set) var duration: Double?
    public private(set) var artworkURL: URL?

    private let timer: TimerSlot
    private var observers: [NSObjectProtocol] = []
    private var following = false
    private var simulated = false
    private var reading = false

    public init(scheduler: Scheduler) {
        timer = TimerSlot(scheduler: scheduler)
        observe(name: "com.apple.Music.playerInfo", app: "Music", durationKey: "Total Time", durationFactor: 1000)
        observe(name: "com.spotify.client.PlaybackStateChanged", app: "Spotify", durationKey: "Duration", durationFactor: 1000)
    }

    private func observe(name: String, app: String, durationKey: String, durationFactor: Int) {
        let token = DistributedNotificationCenter.default().addObserver(forName: Notification.Name(name), object: nil, queue: .main) { [weak self] note in
            let info = note.userInfo ?? [:]
            let state = info["Player State"] as? String ?? ""
            let title = info["Name"] as? String ?? ""
            let artist = info["Artist"] as? String ?? ""
            let album = info["Album"] as? String ?? ""
            let duration = (info[durationKey] as? NSNumber)?.intValue
            MainActor.assumeIsolated {
                self?.update(app: app, state: state, title: title, artist: artist, album: album, lengthMicroseconds: duration.map { $0 * durationFactor })
            }
        }
        observers.append(token)
    }

    private func update(app: String, state: String, title: String, artist: String, album: String, lengthMicroseconds: Int?) {
        if state == "Stopped" || title.isEmpty {
            if current?.app == app {
                current = nil
                clearProgress()
                changed.emit()
                follow()
            }
            return
        }
        if current?.app != app { clearProgress() }
        simulated = false
        current = MediaTrack(
            title: title, artist: artist, album: album, lengthMicroseconds: lengthMicroseconds, app: app, playing: state == "Playing",
            canPrevious: true, canNext: true
        )
        changed.emit()
        follow()
    }

    public func simulate(_ track: MediaTrack?, position: Double? = nil, duration: Double? = nil) {
        simulated = track != nil
        current = track
        self.position = position
        self.duration = duration
        artworkURL = nil
        changed.emit()
        follow()
    }

    public func setFollowingProgress(_ isFollowing: Bool) {
        following = isFollowing
        follow()
    }

    private func follow() {
        guard following, let track = current, !simulated else { return timer.stop() }
        readProgress()
        if !track.playing {
            timer.stop()
        } else if !timer.active {
            timer.every(progressSeconds) { [weak self] in self?.readProgress() }
        }
    }

    private func readProgress() {
        guard !reading, let app = current?.app, let player = players[app],
            !NSRunningApplication.runningApplications(withBundleIdentifier: player.bundleId).isEmpty
        else { return }
        reading = true
        Task {
            let progress = await evaluateAppleScript(player.progressScript) { result in
                PlayerProgress(
                    position: result.atIndex(1)?.doubleValue, duration: result.atIndex(2)?.doubleValue,
                    artwork: result.atIndex(3)?.stringValue.flatMap { URL(string: $0) }
                )
            }
            reading = false
            guard current?.app == app, !simulated else { return }
            position = progress?.position
            duration = progress?.duration
            artworkURL = progress?.artwork
            progressChanged.emit()
        }
    }

    private func clearProgress() {
        position = nil
        duration = nil
        artworkURL = nil
    }

    public func playPause() { send("playpause") }
    public func next() { send("next track") }
    public func previous() { send("previous track") }

    private func send(_ command: String) {
        guard let app = current?.app else { return }
        Task {
            let denied = await runAppleScript("tell application \"\(app)\" to \(command)") == automationDeniedError
            guard denied != automationDenied else { return }
            automationDenied = denied
            changed.emit()
        }
    }

    public func destroy() {
        timer.stop()
        for observer in observers { DistributedNotificationCenter.default().removeObserver(observer) }
        observers = []
        changed.clearListeners()
        progressChanged.clearListeners()
    }
}
