import Foundation

public struct Meeting: Equatable, Sendable {
    public let title: String
    public let startsAt: Date

    public init(title: String, startsAt: Date) {
        self.title = title
        self.startsAt = startsAt
    }
}

@MainActor
public protocol RecordingSource {
    var startedAt: Date? { get }
    var changed: Event<Void> { get }
}

@MainActor
public protocol SessionsSource {
    var sessions: [SessionState] { get }
    var pending: [PendingRequest] { get }
    var changed: Event<Void> { get }
}

@MainActor
public protocol MeetingsSource {
    var next: Meeting? { get }
    var changed: Event<Void> { get }
}

@MainActor
public protocol NotificationsSource {
    var intercepted: Event<InterceptedNotification> { get }
}

@MainActor
public protocol VolumeSource {
    var changed: Event<Int> { get }
}

@MainActor
public protocol MediaSource {
    var current: MediaTrack? { get }
    var changed: Event<Void> { get }
}

public struct FeedSources {
    public let recording: any RecordingSource
    public let sessions: any SessionsSource
    public let meetings: any MeetingsSource
    public let notifications: any NotificationsSource
    public let volume: any VolumeSource
    public let media: any MediaSource

    public init(
        recording: any RecordingSource,
        sessions: any SessionsSource,
        meetings: any MeetingsSource,
        notifications: any NotificationsSource,
        volume: any VolumeSource,
        media: any MediaSource
    ) {
        self.recording = recording
        self.sessions = sessions
        self.meetings = meetings
        self.notifications = notifications
        self.volume = volume
        self.media = media
    }
}
