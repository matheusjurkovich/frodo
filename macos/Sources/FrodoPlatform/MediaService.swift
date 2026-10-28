import AppKit
import FrodoCore
import Foundation

@MainActor
public final class MediaService: MediaSource, Destroyable {
    public let changed = Event<Void>()
    public private(set) var current: MediaTrack?

    private var observers: [NSObjectProtocol] = []

    public init() {
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
                changed.emit()
            }
            return
        }
        current = MediaTrack(
            title: title, artist: artist, album: album, lengthMicroseconds: lengthMicroseconds, app: app, playing: state == "Playing",
            canPrevious: true, canNext: true
        )
        changed.emit()
    }

    public func simulate(_ track: MediaTrack?) {
        current = track
        changed.emit()
    }

    public func playPause() { send("playpause") }
    public func next() { send("next track") }
    public func previous() { send("previous track") }

    private func send(_ command: String) {
        guard let app = current?.app else { return }
        NSAppleScript(source: "tell application \"\(app)\" to \(command)")?.executeAndReturnError(nil)
    }

    public func destroy() {
        for observer in observers { DistributedNotificationCenter.default().removeObserver(observer) }
        observers = []
        changed.clearListeners()
    }
}
