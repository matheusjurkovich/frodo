import Foundation

public struct CalendarEvent: Identifiable, Equatable, Sendable {
    public let id: String
    public let title: String
    public let start: Date
    public let end: Date
    public let isAllDay: Bool
    public let location: String
    public let colorHex: String
    public let meetingURL: URL?

    public init(id: String, title: String, start: Date, end: Date, isAllDay: Bool, location: String, colorHex: String, meetingURL: URL?) {
        self.id = id
        self.title = title
        self.start = start
        self.end = end
        self.isAllDay = isAllDay
        self.location = location
        self.colorHex = colorHex
        self.meetingURL = meetingURL
    }
}

public func meetingLink(in texts: [String]) -> URL? {
    let meetingPatterns: [Regex<Substring>] = [
        /https?:\/\/meet\.google\.com\/[A-Za-z0-9\-?=&_.]+/,
        /https?:\/\/[A-Za-z0-9.\-]*zoom\.us\/(?:j|my)\/[A-Za-z0-9\-?=&_.]+/,
        /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+/,
        /https?:\/\/teams\.live\.com\/meet\/[^\s<>"']+/,
    ]
    for text in texts {
        for pattern in meetingPatterns {
            if let match = text.firstMatch(of: pattern), let url = URL(string: String(match.0)) { return url }
        }
    }
    return nil
}
