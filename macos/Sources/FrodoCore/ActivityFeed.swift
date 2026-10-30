import Foundation

private let flashSeconds: TimeInterval = 5
private let volumeSeconds: TimeInterval = 1.5
private let shownSeconds: TimeInterval = 5

func sameActivity(_ first: PillActivity?, _ second: PillActivity?) -> Bool {
    switch (first, second) {
    case (nil, nil):
        true
    case let (first?, second?):
        sameActivity(first, second)
    default:
        false
    }
}

private func sameActivity(_ first: PillActivity, _ second: PillActivity) -> Bool {
    switch (first, second) {
    case let (.recording(a), .recording(b)):
        a == b
    case let (.claudePermission(sessionA, requestA), .claudePermission(sessionB, requestB)):
        sessionA.sessionId == sessionB.sessionId && requestA.key == requestB.key
    case let (.claudeWaiting(a), .claudeWaiting(b)), let (.claudeWorking(a), .claudeWorking(b)):
        a.sessionId == b.sessionId && a.status == b.status && a.step == b.step
    case let (.meeting(titleA, startsA), .meeting(titleB, startsB)):
        titleA == titleB && startsA == startsB
    case let (.notification(a), .notification(b)):
        a.id == b.id
    case let (.volume(a), .volume(b)):
        a == b
    case let (.media(a), .media(b)):
        a.title == b.title && a.artist == b.artist && a.coverUrl == b.coverUrl && a.app == b.app
    default:
        false
    }
}

@MainActor
public final class ActivityFeed: Destroyable {
    public let changed = Event<Void>()
    public private(set) var current: PillActivity?

    private let sources: FeedSources
    private let now: () -> Date
    private let disposables = Disposables()
    private let notificationTimer: TimerSlot
    private let volumeTimer: TimerSlot
    private let shownTimer: TimerSlot
    private var seen: [PillActivity] = []
    private var queue: [InterceptedNotification] = []
    private var notification: InterceptedNotification?
    private var volume: Int?

    public init(sources: FeedSources, scheduler: Scheduler, now: @escaping () -> Date = { Date() }) {
        self.sources = sources
        self.now = now
        notificationTimer = TimerSlot(scheduler: scheduler)
        volumeTimer = TimerSlot(scheduler: scheduler)
        shownTimer = TimerSlot(scheduler: scheduler)
        disposables.add(sources.recording.changed.on { [weak self] _ in self?.refresh() })
        disposables.add(sources.sessions.changed.on { [weak self] _ in self?.refresh() })
        disposables.add(sources.meetings.changed.on { [weak self] _ in self?.refresh() })
        disposables.add(sources.media.changed.on { [weak self] _ in self?.refresh() })
        disposables.add(sources.notifications.intercepted.on { [weak self] item in self?.enqueue(item) })
        disposables.add(sources.volume.changed.on { [weak self] percent in self?.showVolume(percent) })
        seen = candidates().filter { $0.kind == .claudeWorking || $0.kind == .media }
        refresh()
    }

    public func cancelTransient() {
        notificationTimer.stop()
        volumeTimer.stop()
        queue = []
        notification = nil
        volume = nil
        seen = candidates()
        refresh()
    }

    public func destroy() {
        notificationTimer.stop()
        volumeTimer.stop()
        shownTimer.stop()
        disposables.dispose()
        changed.clearListeners()
    }

    private func enqueue(_ item: InterceptedNotification) {
        queue.append(item)
        if !notificationTimer.active { nextNotification() }
    }

    private func nextNotification() {
        notification = queue.isEmpty ? nil : queue.removeFirst()
        if notification != nil {
            notificationTimer.once(flashSeconds) { [weak self] in self?.nextNotification() }
        }
        refresh()
    }

    private func showVolume(_ percent: Int) {
        volume = percent
        volumeTimer.once(volumeSeconds) { [weak self] in
            self?.volume = nil
            self?.refresh()
        }
        refresh()
    }

    private func candidates() -> [PillActivity] {
        let moment = now()
        var candidates: [PillActivity] = []
        if let startedAt = sources.recording.startedAt {
            candidates.append(.recording(startedAt: startedAt))
        }
        let sessions = sources.sessions.sessions
        let known = Set(sessions.map(\.sessionId))
        let request = oldestPending(sources.sessions.pending.filter { known.contains($0.sessionId) })
        let asking = request.flatMap { request in sessions.first { $0.sessionId == request.sessionId } }
        if let request, let asking {
            candidates.append(.claudePermission(session: asking, request: request))
        }
        for session in sessions where session.sessionId != asking?.sessionId {
            switch displayStatus(session, now: moment) {
            case .waiting:
                candidates.append(.claudeWaiting(session: session))
            case .working where session.tool != nil:
                candidates.append(.claudeWorking(session: session))
            default:
                break
            }
        }
        if let meeting = sources.meetings.next {
            candidates.append(.meeting(title: meeting.title, startsAt: meeting.startsAt))
        }
        if let notification {
            candidates.append(.notification(notification))
        }
        if let volume {
            candidates.append(.volume(percent: volume))
        }
        if let track = sources.media.current, track.playing {
            candidates.append(.media(track))
        }
        return candidates
    }

    private func refresh() {
        let candidates = candidates()
        seen = seen.filter { seen in candidates.contains { sameActivity(seen, $0) } }
        let previous = current
        let next = pickActivity(candidates.filter { candidate in !seen.contains { sameActivity($0, candidate) } })
        current = next
        if sameActivity(previous, next) { return }
        if let next, next.kind != .notification, next.kind != .volume {
            shownTimer.once(shownSeconds) { [weak self] in
                self?.seen.append(next)
                self?.refresh()
            }
        } else {
            shownTimer.stop()
        }
        changed.emit()
    }
}
