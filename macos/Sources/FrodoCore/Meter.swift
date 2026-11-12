import Foundation

private let warnPercent = 80.0
private let critPercent = 95.0
private let dayLength: TimeInterval = 24 * 3600
private let weekdayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]

public struct Meter: Equatable, Sendable {
    public let key: String
    public let label: String
    public let short: String
    public let percent: Double
    public let note: String

    public init(key: String, label: String, short: String, percent: Double, note: String) {
        self.key = key
        self.label = label
        self.short = short
        self.percent = percent
        self.note = note
    }
}

@MainActor
public protocol MeterSource: AnyObject {
    func meters(now: Date) -> [Meter]
    var changed: Event<Void> { get }
}

public struct QuotaReading: Equatable, Sendable {
    public let id: String
    public let provider: AiProvider
    public let name: String
    public let window: String
    public let percent: Double

    public init(id: String, provider: AiProvider, name: String, window: String, percent: Double) {
        self.id = id
        self.provider = provider
        self.name = name
        self.window = window
        self.percent = percent
    }
}

public struct QuotaNotice: Equatable, Sendable {
    public let provider: AiProvider
    public let title: String
    public let body: String

    public init(provider: AiProvider, title: String, body: String) {
        self.provider = provider
        self.title = title
        self.body = body
    }
}

public func meterLevel(_ percent: Double) -> Level {
    if percent >= critPercent { return .crit }
    return percent >= warnPercent ? .warn : .ok
}

private func levelPercent(_ level: Level) -> Int {
    switch level {
    case .ok: 0
    case .warn: Int(warnPercent)
    case .crit: Int(critPercent)
    }
}

public func clockTime(_ date: Date, calendar: Calendar = .current) -> String {
    "\(pad(calendar.component(.hour, from: date))):\(pad(calendar.component(.minute, from: date)))"
}

public func resetNote(_ resetsAt: Date, now: Date, calendar: Calendar = .current) -> String {
    let left = resetsAt.timeIntervalSince(now)
    if left <= 0 { return "Reiniciada" }
    if left >= dayLength {
        let weekday = calendar.component(.weekday, from: resetsAt) - 1
        return "Reinicia \(weekdayNames[weekday]), \(clockTime(resetsAt, calendar: calendar))"
    }
    let minutes = max(1, Int((left / 60).rounded(.up)))
    let hours = minutes / 60
    if hours == 0 { return "Reinicia em \(minutes) min" }
    return minutes % 60 == 0 ? "Reinicia em \(hours) h" : "Reinicia em \(hours) h \(minutes % 60) min"
}

public func shownMeterPercent(_ percent: Double, remaining: Bool) -> Double {
    let clamped = min(max(percent, 0), 100)
    return remaining ? 100 - clamped : clamped
}

public func quotaNotices(_ previous: [String: Level], _ readings: [QuotaReading]) -> (states: [String: Level], notices: [QuotaNotice]) {
    var states: [String: Level] = [:]
    var notices: [QuotaNotice] = []
    for reading in readings {
        let next = meterLevel(reading.percent)
        guard let before = previous[reading.id] else {
            states[reading.id] = next
            continue
        }
        if next > before {
            let limit = levelPercent(next)
            notices.append(QuotaNotice(provider: reading.provider, title: "Cota em \(limit)%", body: "\(reading.name): \(limit)% da cota de \(reading.window)"))
            states[reading.id] = next
        } else if next == .ok && before != .ok {
            notices.append(QuotaNotice(provider: reading.provider, title: "Cota renovada", body: "\(reading.name): cota de \(reading.window) renovada"))
            states[reading.id] = .ok
        } else {
            states[reading.id] = before
        }
    }
    return (states, notices)
}
