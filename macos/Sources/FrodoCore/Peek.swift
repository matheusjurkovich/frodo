import Foundation

public func nextPeek(after now: Date, everyMinutes: Int, calendar: Calendar = .current) -> Date {
    let step = max(1, everyMinutes)
    let parts = calendar.dateComponents([.hour, .minute], from: now)
    let hour = parts.hour ?? 0
    let minute = parts.minute ?? 0
    let minutesIntoDay = hour * 60 + minute
    let target = (minutesIntoDay / step + 1) * step
    let today = calendar.startOfDay(for: now)
    let day = calendar.date(byAdding: .day, value: target / 1440, to: today) ?? today
    let wallClockMinutes = target % 1440
    return calendar.date(bySettingHour: wallClockMinutes / 60, minute: wallClockMinutes % 60, second: 0, of: day)
        ?? now.addingTimeInterval(Double(step) * 60)
}

public struct PeekState: Equatable, Sendable {
    public let startedAt: Date
    public let seconds: Int

    public init(startedAt: Date, seconds: Int) {
        self.startedAt = startedAt
        self.seconds = seconds
    }
}

@MainActor
public final class PeekCycle {
    private let slot: TimerSlot
    private let now: @MainActor () -> Date
    private let calendar: Calendar
    private let canStart: @MainActor () -> Bool
    private let onChange: @MainActor (PeekState?) -> Void
    private var everyMinutes = 10
    private var seconds = 10
    private var armedFor = Date.distantPast

    public private(set) var current: PeekState?

    public init(
        scheduler: Scheduler,
        now: @escaping @MainActor () -> Date = { Date() },
        calendar: Calendar = .current,
        canStart: @escaping @MainActor () -> Bool,
        onChange: @escaping @MainActor (PeekState?) -> Void
    ) {
        slot = TimerSlot(scheduler: scheduler)
        self.now = now
        self.calendar = calendar
        self.canStart = canStart
        self.onChange = onChange
    }

    public func update(active: Bool, everyMinutes: Int, seconds: Int) {
        self.everyMinutes = everyMinutes
        self.seconds = seconds
        guard active else {
            stop()
            return
        }
        guard current == nil else { return }
        armNext()
    }

    public func stop() {
        slot.stop()
        finish()
    }

    private func armNext() {
        let moment = now()
        armedFor = nextPeek(after: moment, everyMinutes: everyMinutes, calendar: calendar)
        slot.once(max(0, armedFor.timeIntervalSince(moment))) { [weak self] in self?.begin() }
    }

    private func begin() {
        guard canStart() else {
            armNext()
            return
        }
        let state = PeekState(startedAt: max(now(), armedFor), seconds: seconds)
        current = state
        onChange(state)
        slot.once(Double(seconds)) { [weak self] in
            self?.finish()
            self?.armNext()
        }
    }

    private func finish() {
        guard current != nil else { return }
        current = nil
        onChange(nil)
    }
}
