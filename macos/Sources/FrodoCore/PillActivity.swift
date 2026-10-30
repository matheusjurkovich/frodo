import Foundation

public enum PillActivity: Equatable, Sendable, ActivityKinded {
    case recording(startedAt: Date)
    case claudePermission(session: SessionState, request: PendingRequest)
    case claudeWaiting(session: SessionState)
    case meeting(title: String, startsAt: Date)
    case notification(InterceptedNotification)
    case volume(percent: Int)
    case claudeWorking(session: SessionState)
    case media(MediaTrack)

    public var clickTab: TabId? {
        switch self {
        case .notification: .notifications
        case .claudeWorking: .claude
        default: nil
        }
    }

    public var hasAction: Bool {
        switch self {
        case .recording, .claudePermission, .claudeWaiting, .meeting, .media: true
        case .notification, .volume, .claudeWorking: false
        }
    }

    public var kind: ActivityKind {
        switch self {
        case .recording: .recording
        case .claudePermission: .claudePermission
        case .claudeWaiting: .claudeWaiting
        case .meeting: .meeting
        case .notification: .notification
        case .volume: .volume
        case .claudeWorking: .claudeWorking
        case .media: .media
        }
    }
}

public func sameSubject(_ first: PillActivity?, _ second: PillActivity?) -> Bool {
    switch (first, second) {
    case (nil, nil):
        true
    case let (first?, second?):
        sameSubject(first, second)
    default:
        false
    }
}

private func sameSubject(_ first: PillActivity, _ second: PillActivity) -> Bool {
    switch (first, second) {
    case (.recording, .recording), (.volume, .volume):
        true
    case let (.claudeWaiting(a), .claudeWaiting(b)), let (.claudeWorking(a), .claudeWorking(b)):
        a.sessionId == b.sessionId
    case let (.claudePermission(a, requestA), .claudePermission(b, requestB)):
        a.sessionId == b.sessionId && requestA.key == requestB.key
    case let (.meeting(titleA, startsA), .meeting(titleB, startsB)):
        titleA == titleB && startsA == startsB
    case let (.notification(a), .notification(b)):
        a.id == b.id
    case let (.media(a), .media(b)):
        a.title == b.title && a.artist == b.artist && a.app == b.app
    default:
        false
    }
}
