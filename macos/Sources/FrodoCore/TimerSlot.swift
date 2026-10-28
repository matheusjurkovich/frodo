import Foundation

@MainActor
public protocol Scheduler {
    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe
}

@MainActor
public struct SystemScheduler: Scheduler {
    public init() {}

    public func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe {
        let timer = Timer(timeInterval: interval, repeats: repeating) { _ in
            MainActor.assumeIsolated { action() }
        }
        RunLoop.main.add(timer, forMode: .common)
        return { timer.invalidate() }
    }
}

@MainActor
public final class TimerSlot {
    private let scheduler: Scheduler
    private var cancel: Unsubscribe?

    public init(scheduler: Scheduler) {
        self.scheduler = scheduler
    }

    public var active: Bool {
        cancel != nil
    }

    public func once(_ interval: TimeInterval, _ action: @escaping @MainActor () -> Void) {
        stop()
        cancel = scheduler.schedule(after: interval, repeating: false) { [weak self] in
            self?.cancel = nil
            action()
        }
    }

    public func every(_ interval: TimeInterval, _ action: @escaping @MainActor () -> Void) {
        stop()
        cancel = scheduler.schedule(after: interval, repeating: true, action: action)
    }

    public func stop() {
        cancel?()
        cancel = nil
    }
}
