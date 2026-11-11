import AppKit
import EventKit
import FrodoCore
import Foundation

private let refreshSeconds: TimeInterval = 30
private let storeChangeDebounce: TimeInterval = 0.3

public enum CalendarAccess: Sendable {
    case unknown
    case granted
    case denied
}

@MainActor
public final class CalendarService: MeetingsSource, Destroyable {
    public let changed = Event<Void>()
    public private(set) var next: Meeting?
    public private(set) var nextMeetingURL: URL?
    public private(set) var access: CalendarAccess = .unknown

    private let store = EKEventStore()
    private let settings: FrodoSettings
    private let timer: TimerSlot
    private let storeChange: TimerSlot
    private var dayEvents: [Date: [CalendarEvent]] = [:]
    private var monthDays: [Date: Set<Int>] = [:]
    private var loading: Set<String> = []
    private var generation = 0
    private var observer: NSObjectProtocol?
    private var settingsSubscription: Unsubscribe?
    private var demoEvents: [CalendarEvent]?

    public init(settings: FrodoSettings, scheduler: Scheduler) {
        self.settings = settings
        timer = TimerSlot(scheduler: scheduler)
        storeChange = TimerSlot(scheduler: scheduler)
        access = Self.currentAccess()
        settingsSubscription = settings.onChanged(["meeting-notice-minutes"]) { [weak self] in self?.refresh() }
        observer = NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: store, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.scheduleStoreChange() }
        }
        timer.every(refreshSeconds) { [weak self] in self?.refresh() }
        refresh()
    }

    private static func currentAccess() -> CalendarAccess {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess, .authorized: .granted
        case .denied, .restricted, .writeOnly: .denied
        default: .unknown
        }
    }

    public func requestAccess() async {
        NSApp.activate(ignoringOtherApps: true)
        let granted = (try? await store.requestFullAccessToEvents()) ?? false
        access = granted ? .granted : .denied
        invalidate()
        refresh()
        changed.emit()
    }

    public func installDemo(events: [CalendarEvent], meeting: Meeting?, url: URL?) {
        demoEvents = events
        access = .granted
        next = meeting
        nextMeetingURL = url
        changed.emit()
    }

    private func scheduleStoreChange() {
        storeChange.once(storeChangeDebounce) { [weak self] in
            guard let self else { return }
            self.invalidate()
            self.refresh()
            self.changed.emit()
        }
    }

    private func invalidate() {
        generation += 1
        dayEvents = [:]
        monthDays = [:]
        loading = []
    }

    public func refresh() {
        if demoEvents != nil { return }
        let current = nextMeetingFromStore()
        if current != next {
            next = current
            changed.emit()
        }
    }

    private func nextMeetingFromStore() -> Meeting? {
        let leadSeconds = TimeInterval(settings.meetingNoticeMinutes * 60)
        guard Self.currentAccess() == .granted, leadSeconds > 0 else {
            nextMeetingURL = nil
            return nil
        }
        let now = Date()
        let predicate = store.predicateForEvents(withStart: now, end: now.addingTimeInterval(leadSeconds + 60), calendars: nil)
        let stored = store.events(matching: predicate)
        let events = stored.map { MeetingEvent(summary: $0.title ?? "Sem título", date: $0.startDate, end: $0.endDate) }
        let meeting = nextMeeting(events, now: now, lead: leadSeconds)
        nextMeetingURL = stored.first { $0.startDate == meeting?.startsAt }.flatMap { Self.map($0).meetingURL }
        return meeting
    }

    public func events(on day: Date) -> [CalendarEvent] {
        if let demoEvents { return demoEvents.filter { Calendar.current.isDate($0.start, inSameDayAs: day) } }
        guard Self.currentAccess() == .granted else { return [] }
        let start = Calendar.current.startOfDay(for: day)
        if let cached = dayEvents[start] { return cached }
        if let end = Calendar.current.date(byAdding: .day, value: 1, to: start) {
            load(key: "day-\(start.timeIntervalSince1970)", start: start, end: end) { [weak self] events in
                self?.dayEvents[start] = events.sorted { $0.start < $1.start }
            }
        }
        return []
    }

    public func daysWithEvents(inMonthOf date: Date) -> Set<Int> {
        if let demoEvents { return Set(demoEvents.map { Calendar.current.component(.day, from: $0.start) }) }
        guard Self.currentAccess() == .granted, let interval = Calendar.current.dateInterval(of: .month, for: date) else { return [] }
        if let cached = monthDays[interval.start] { return cached }
        load(key: "month-\(interval.start.timeIntervalSince1970)", start: interval.start, end: interval.end) { [weak self] events in
            self?.monthDays[interval.start] = Set(events.map { Calendar.current.component(.day, from: $0.start) })
        }
        return []
    }

    private func load(key: String, start: Date, end: Date, apply: @escaping @MainActor ([CalendarEvent]) -> Void) {
        guard !loading.contains(key) else { return }
        loading.insert(key)
        let expected = generation
        let store = store
        Task {
            let events = await Self.fetch(store: store, start: start, end: end)
            guard expected == generation else { return }
            loading.remove(key)
            apply(events)
            changed.emit()
        }
    }

    nonisolated private static func fetch(store: EKEventStore, start: Date, end: Date) async -> [CalendarEvent] {
        store.events(matching: store.predicateForEvents(withStart: start, end: end, calendars: nil)).map(Self.map)
    }

    nonisolated private static func map(_ event: EKEvent) -> CalendarEvent {
        let texts = [event.location ?? "", event.notes ?? "", event.url?.absoluteString ?? ""]
        let color = event.calendar.color.usingColorSpace(.sRGB) ?? .systemBlue
        let hex = String(format: "#%02X%02X%02X", Int(color.redComponent * 255), Int(color.greenComponent * 255), Int(color.blueComponent * 255))
        return CalendarEvent(
            id: event.eventIdentifier ?? UUID().uuidString, title: event.title ?? "Sem título", start: event.startDate, end: event.endDate,
            isAllDay: event.isAllDay, location: event.location ?? "", colorHex: hex, meetingURL: meetingLink(in: texts)
        )
    }

    public func destroy() {
        timer.stop()
        storeChange.stop()
        settingsSubscription?()
        if let observer { NotificationCenter.default.removeObserver(observer) }
        changed.clearListeners()
    }
}
