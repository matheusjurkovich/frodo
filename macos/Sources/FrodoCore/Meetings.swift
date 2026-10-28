import Foundation

public struct MeetingEvent: Equatable, Sendable {
    public let summary: String
    public let date: Date
    public let end: Date

    public init(summary: String, date: Date, end: Date) {
        self.summary = summary
        self.date = date
        self.end = end
    }
}

private func atMidnight(_ date: Date, calendar: Calendar) -> Bool {
    let parts = calendar.dateComponents([.hour, .minute, .second], from: date)
    return parts.hour == 0 && parts.minute == 0 && parts.second == 0
}

private func isAllDay(_ event: MeetingEvent, calendar: Calendar) -> Bool {
    event.end > event.date && atMidnight(event.date, calendar: calendar) && atMidnight(event.end, calendar: calendar)
}

public func nextMeeting(_ events: [MeetingEvent], now: Date, lead: TimeInterval, calendar: Calendar = .current) -> Meeting? {
    var next: Meeting?
    for event in events {
        let startsAt = event.date
        if startsAt <= now || startsAt > now.addingTimeInterval(lead) || isAllDay(event, calendar: calendar) { continue }
        if let current = next, startsAt >= current.startsAt { continue }
        next = Meeting(title: event.summary, startsAt: startsAt)
    }
    return next
}
