import Foundation

@MainActor
public final class HoverIntent {
    private let openDelay: TimeInterval
    private let closeDelay: TimeInterval
    private let autoCloseDelay: TimeInterval
    private let pollInterval: TimeInterval
    private let openSlot: TimerSlot
    private let closeSlot: TimerSlot
    private let autoCloseSlot: TimerSlot
    private let pollSlot: TimerSlot

    public init(scheduler: Scheduler, openDelay: TimeInterval, closeDelay: TimeInterval, autoCloseDelay: TimeInterval, pollInterval: TimeInterval) {
        self.openDelay = openDelay
        self.closeDelay = closeDelay
        self.autoCloseDelay = autoCloseDelay
        self.pollInterval = pollInterval
        openSlot = TimerSlot(scheduler: scheduler)
        closeSlot = TimerSlot(scheduler: scheduler)
        autoCloseSlot = TimerSlot(scheduler: scheduler)
        pollSlot = TimerSlot(scheduler: scheduler)
    }

    public func entered(canOpen: Bool, open: @escaping @MainActor () -> Void) {
        closeSlot.stop()
        guard canOpen, !openSlot.active else { return }
        openSlot.once(openDelay, open)
    }

    public func left(canClose: Bool, close: @escaping @MainActor () -> Void) {
        openSlot.stop()
        guard canClose, !closeSlot.active else { return }
        closeSlot.once(closeDelay, close)
    }

    public func opened(poll: @escaping @MainActor () -> Void, autoClose: (@MainActor () -> Void)?) {
        pollSlot.every(pollInterval, poll)
        autoCloseSlot.stop()
        if let autoClose { autoCloseSlot.once(autoCloseDelay, autoClose) }
    }

    public func closed() {
        pollSlot.stop()
        autoCloseSlot.stop()
    }

    public func stop() {
        openSlot.stop()
        closeSlot.stop()
        closed()
    }
}
