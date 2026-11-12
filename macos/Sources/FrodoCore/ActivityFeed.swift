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
    private let gate = StepGate()
    private var held: SessionState?
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
        seen = transient().filter { $0.kind == .claudeWorking || $0.kind == .media }
        refresh()
    }

    public func aiActivityChanged() {
        let shown = current != nil
        shownTimer.stop()
        held = nil
        current = nil
        refresh()
        if shown && current == nil { changed.emit() }
    }

    public func cancelTransient() {
        notificationTimer.stop()
        volumeTimer.stop()
        queue = []
        notification = nil
        volume = nil
        seen = transient()
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

    private func transient() -> [PillActivity] {
        let always = sources.aiActivity() == .always
        return candidates().filter { !always || $0.kind != .claudeWorking }
    }

    private func showsWorking(_ session: SessionState, now: Date) -> Bool {
        switch sources.aiActivity() {
        case .always: true
        case .never: false
        case .change: gate.admits(session.sessionId, step: session.step, now: now)
        }
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
        let recent = sessions.enumerated().sorted { first, second in
            first.element.updatedAt == second.element.updatedAt ? first.offset < second.offset : first.element.updatedAt > second.element.updatedAt
        }
        for session in recent.map(\.element) where session.sessionId != asking?.sessionId {
            switch displayStatus(session, now: moment) {
            case .waiting:
                candidates.append(.claudeWaiting(session: session))
            case .working where session.tool != nil:
                if let held, held.sessionId == session.sessionId {
                    candidates.append(.claudeWorking(session: held))
                } else if showsWorking(session, now: moment) {
                    candidates.append(.claudeWorking(session: session))
                }
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
        let ids = Set(sources.sessions.sessions.map(\.sessionId))
        gate.retain(ids)
        if let held, !ids.contains(held.sessionId) { self.held = nil }
        let candidates = candidates()
        seen = seen.filter { seen in candidates.contains { sameActivity(seen, $0) } }
        let previous = current
        let next = pickActivity(candidates.filter { candidate in !seen.contains { sameActivity($0, candidate) } })
        current = next
        if sameActivity(previous, next) { return }
        let mode = sources.aiActivity()
        if mode == .change, let previous, previous.kind == .claudeWorking, next?.kind == .claudeWorking { seen.append(previous) }
        if mode == .change, case let .claudeWorking(session)? = next {
            gate.shown(session.sessionId, now: now())
            held = session
        }
        if mode == .always, next?.kind == .claudeWorking {
            shownTimer.stop()
        } else if let next, next.kind != .notification, next.kind != .volume {
            shownTimer.once(next.kind == .claudeWorking ? stepShownSeconds : shownSeconds) { [weak self] in
                guard let self else { return }
                self.seen.append(next)
                if case let .claudeWorking(session) = next, self.held == session { self.held = nil }
                self.refresh()
            }
        } else {
            shownTimer.stop()
        }
        changed.emit()
    }
}
