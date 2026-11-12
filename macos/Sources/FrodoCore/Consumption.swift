import Foundation

let keptDays = 30
private let maxProjects = 4
private let firstHour = 8
private let lastHour = 18
private let labelEvery = 7
private let maxHourLabels = 12

public enum Period: Sendable {
    case today
    case week
    case month

    var days: Int {
        switch self {
        case .today: 1
        case .week: 7
        case .month: keptDays
        }
    }
}

public struct Bar: Equatable, Sendable {
    public let label: String
    public let value: Int
    public let current: Bool
    public let future: Bool

    public init(label: String, value: Int, current: Bool, future: Bool) {
        self.label = label
        self.value = value
        self.current = current
        self.future = future
    }
}

public struct Share: Equatable, Sendable {
    public let name: String
    public let label: String
    public let tokens: Int
    public let fraction: Double
}

public struct ConsumptionSummary: Equatable, Sendable {
    public let input: Int
    public let output: Int
    public let cacheRead: Int
    public let sessions: Int
    public let total: Int
    public let bars: [Bar]
    public let models: [Share]
    public let projects: [Share]
}

public struct UsageCell: Equatable, Sendable {
    public var hour: Date
    public var model: String
    public var project: String
    public var session: String
    public var input: Int
    public var output: Int
    public var cacheRead: Int

    public init(hour: Date, model: String, project: String, session: String, input: Int, output: Int, cacheRead: Int) {
        self.hour = hour
        self.model = model
        self.project = project
        self.session = session
        self.input = input
        self.output = output
        self.cacheRead = cacheRead
    }
}

public struct ModelGroups: Sendable {
    public let order: [String]
    public let family: @Sendable (String) -> String
    public let label: @Sendable (String) -> String

    public init(order: [String], family: @escaping @Sendable (String) -> String, label: @escaping @Sendable (String) -> String) {
        self.order = order
        self.family = family
        self.label = label
    }
}

@MainActor
public protocol ConsumptionSource: AnyObject {
    var scanning: Bool { get }
    func summary(_ period: Period) -> ConsumptionSummary
    func setWanted(_ wanted: Bool)
    var changed: Event<Void> { get }
}

private struct Latest {
    var tokens = 0
    var hour: Date
    var model: String
}

func hourStart(_ date: Date, calendar: Calendar) -> Date {
    calendar.dateInterval(of: .hour, for: date)?.start ?? date
}

func dayStart(_ date: Date, daysBack: Int = 0, calendar: Calendar) -> Date {
    let start = calendar.startOfDay(for: date)
    return calendar.date(byAdding: .day, value: -daysBack, to: start) ?? start
}

public func consumptionStart(_ now: Date, calendar: Calendar = .current) -> Date {
    dayStart(now, daysBack: keptDays - 1, calendar: calendar)
}

func cellKey(_ cell: UsageCell) -> String {
    [String(cell.hour.timeIntervalSince1970), cell.model, cell.project, cell.session].joined(separator: "\u{0}")
}

public func addCell(_ cells: inout [String: UsageCell], _ cell: UsageCell) {
    let key = cellKey(cell)
    guard var target = cells[key] else {
        cells[key] = cell
        return
    }
    target.input += cell.input
    target.output += cell.output
    target.cacheRead += cell.cacheRead
    cells[key] = target
}

private func share(name: String, label: String, tokens: Int, total: Int) -> Share {
    Share(name: name, label: label, tokens: tokens, fraction: total > 0 ? Double(tokens) / Double(total) : 0)
}

private func hourBars(_ slots: [Int: Int], now: Date, calendar: Calendar) -> [Bar] {
    let nowHour = calendar.component(.hour, from: now)
    let used = slots.filter { $0.value > 0 }.map(\.key)
    let first = min(firstHour, used.min() ?? firstHour)
    let last = max(lastHour, nowHour)
    let length = last - first + 1
    let step = length > maxHourLabels ? 2 : 1
    return (0 ..< length).map { index in
        let hour = first + index
        return Bar(label: index % step == 0 ? "\(pad(hour))h" : "", value: slots[hour] ?? 0, current: hour == nowHour, future: hour > nowHour)
    }
}

private func dayBars(_ slots: [Int: Int], now: Date, period: Period, calendar: Calendar) -> [Bar] {
    let days = period.days
    return (0 ..< days).map { index in
        let day = dayStart(now, daysBack: days - 1 - index, calendar: calendar)
        let label: String
        if period == .week {
            label = weekdayLabel(calendar.component(.weekday, from: day) - 1)
        } else {
            label = index % labelEvery == 0 ? "\(calendar.component(.day, from: day))/\(calendar.component(.month, from: day))" : ""
        }
        return Bar(label: label, value: slots[Int(day.timeIntervalSince1970)] ?? 0, current: index == days - 1, future: false)
    }
}

public func summarize(_ cells: [UsageCell], period: Period, now: Date, groups: ModelGroups, calendar: Calendar = .current) -> ConsumptionSummary {
    let from = dayStart(now, daysBack: period.days - 1, calendar: calendar)
    let until = dayStart(now, daysBack: -1, calendar: calendar)
    var slots: [Int: Int] = [:]
    var daySlots: [Date: Int] = [:]
    var sessionIds = Set<String>()
    var models: [String: Latest] = [:]
    var projects: [String: Int] = [:]
    var input = 0
    var output = 0
    var cacheRead = 0
    for cell in cells {
        if cell.hour < from || cell.hour >= until { continue }
        let tokens = cell.input + cell.output
        input += cell.input
        output += cell.output
        cacheRead += cell.cacheRead
        sessionIds.insert(cell.session)
        projects[cell.project, default: 0] += tokens
        let family = groups.family(cell.model)
        var latest = models[family] ?? Latest(hour: cell.hour, model: cell.model)
        latest.tokens += tokens
        if cell.hour >= latest.hour {
            latest.hour = cell.hour
            latest.model = cell.model
        }
        models[family] = latest
        let slot: Int
        if period == .today {
            slot = calendar.component(.hour, from: cell.hour)
        } else if let cached = daySlots[cell.hour] {
            slot = cached
        } else {
            slot = Int(dayStart(cell.hour, calendar: calendar).timeIntervalSince1970)
            daySlots[cell.hour] = slot
        }
        slots[slot, default: 0] += tokens
    }
    let total = input + output
    return ConsumptionSummary(
        input: input,
        output: output,
        cacheRead: cacheRead,
        sessions: sessionIds.count,
        total: total,
        bars: period == .today ? hourBars(slots, now: now, calendar: calendar) : dayBars(slots, now: now, period: period, calendar: calendar),
        models: groups.order.compactMap { family in
            guard let latest = models[family], latest.tokens > 0 else { return nil }
            return share(name: family, label: groups.label(latest.model), tokens: latest.tokens, total: total)
        },
        projects: projects
            .filter { $0.value > 0 }
            .sorted { $0.value != $1.value ? $0.value > $1.value : $0.key.localizedCompare($1.key) == .orderedAscending }
            .prefix(maxProjects)
            .map { share(name: $0.key, label: $0.key, tokens: $0.value, total: total) }
    )
}
