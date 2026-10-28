import Foundation

private let weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
private let months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

func pad(_ number: Int) -> String {
    number < 10 ? "0\(number)" : "\(number)"
}

public func weekdayLabel(_ day: Int) -> String {
    guard weekdays.indices.contains(day) else { return "" }
    return weekdays[day].prefix(1).uppercased() + weekdays[day].dropFirst()
}

public func formatDate(_ date: Date, calendar: Calendar = .current) -> String {
    let parts = calendar.dateComponents([.weekday, .day, .month], from: date)
    let weekday = (parts.weekday ?? 1) - 1
    let month = (parts.month ?? 1) - 1
    return "\(weekdayLabel(weekday)), \(parts.day ?? 1) \(months.indices.contains(month) ? months[month] : "")"
}

private func decimal(_ value: Double) -> String {
    let rounded = (value * 10).rounded() / 10
    let text = rounded == rounded.rounded() ? String(Int(rounded)) : String(rounded)
    return text.replacingOccurrences(of: ".", with: ",")
}

public func formatTokens(_ count: Int) -> String {
    let n = Double(count)
    if n < 1e3 { return String(count) }
    if (n / 1e3).rounded() < 1e3 { return "\(Int((n / 1e3).rounded())) mil" }
    if (n / 1e5).rounded() / 10 < 1e3 { return "\(decimal(n / 1e6)) mi" }
    return "\(decimal(n / 1e9)) bi"
}

public func formatTimer(_ seconds: Double) -> String {
    let total = Int(seconds.rounded(.down))
    let hours = total / 3600
    let minutes = total / 60 % 60
    let rest = pad(total % 60)
    return hours > 0 ? "\(hours):\(pad(minutes)):\(rest)" : "\(minutes):\(rest)"
}

public func secondsSince(_ then: Date, now: Date) -> Double {
    let seconds = now.timeIntervalSince(then)
    return seconds.isFinite ? max(0, seconds) : 0
}

public func formatAgo(_ then: Date, now: Date) -> String {
    let minutes = Int((now.timeIntervalSince(then) / 60).rounded(.down))
    if minutes < 1 { return "agora" }
    if minutes < 60 { return "\(minutes) min" }
    if minutes < 24 * 60 { return "\(minutes / 60) h" }
    return "\(minutes / (24 * 60)) d"
}

public func formatUntil(_ start: Date, now: Date) -> String {
    let minutes = Int((start.timeIntervalSince(now) / 60).rounded(.up))
    return minutes > 0 ? "Em \(minutes) min" : "Agora"
}

public func formatSpan(_ seconds: Double) -> String {
    let minutes = max(1, Int((seconds / 60).rounded(.down)))
    return minutes < 60 ? "\(minutes) min" : "\(minutes / 60) h \(pad(minutes % 60)) min"
}

public func ellipsize(_ text: String, max: Int) -> String {
    text.count <= max ? text : "\(text.prefix(max - 1))…"
}
