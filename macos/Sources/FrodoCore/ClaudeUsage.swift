import Foundation

public enum WindowRole: Int, Sendable {
    case session
    case weekly
    case scoped
    case other
}

public enum TierIcon: String, CaseIterable, Sendable {
    case free
    case pro
    case max
    case team
    case enterprise
}

public struct UsageWindow: Equatable, Sendable {
    public let key: String
    public let label: String
    public let role: WindowRole
    public let utilization: Double
    public let resetsAt: String?
    public let totalSeconds: Double?
    public let apiLevel: Level
    public let isActive: Bool

    public init(
        key: String,
        label: String,
        role: WindowRole,
        utilization: Double,
        resetsAt: String?,
        totalSeconds: Double?,
        apiLevel: Level,
        isActive: Bool
    ) {
        self.key = key
        self.label = label
        self.role = role
        self.utilization = utilization
        self.resetsAt = resetsAt
        self.totalSeconds = totalSeconds
        self.apiLevel = apiLevel
        self.isActive = isActive
    }
}

public struct Spend: Equatable, Sendable {
    public let used: String?
    public let limit: String?
    public let percent: Double?
    public let level: Level

    public init(used: String?, limit: String?, percent: Double?, level: Level) {
        self.used = used
        self.limit = limit
        self.percent = percent
        self.level = level
    }
}

public struct LevelInput: Sendable {
    public let utilization: Double
    public let resetsAt: String?
    public let totalSeconds: Double?
    public let apiLevel: Level

    public init(utilization: Double, resetsAt: String?, totalSeconds: Double?, apiLevel: Level) {
        self.utilization = utilization
        self.resetsAt = resetsAt
        self.totalSeconds = totalSeconds
        self.apiLevel = apiLevel
    }
}

public struct AccountSummary: Equatable, Sendable {
    public let who: String?
    public let plan: String?
    public let rateLimitTier: String?
    public let subtitle: String

    public init(who: String?, plan: String?, rateLimitTier: String?, subtitle: String) {
        self.who = who
        self.plan = plan
        self.rateLimitTier = rateLimitTier
        self.subtitle = subtitle
    }
}

private let fiveHourSeconds: Double = 5 * 3600
private let sevenDaySeconds: Double = 7 * 24 * 3600
private let lockoutCritFraction = 0.1
private let displayWarnUtilization: Double = 80
private let knownModels = ["opus": "Opus", "sonnet": "Sonnet", "haiku": "Haiku", "oauth_apps": "OAuth Apps"]

private func humanize(_ token: String) -> String {
    token
        .split(whereSeparator: { $0 == "_" || $0.isWhitespace })
        .map { word in word.prefix(1).uppercased() + word.dropFirst() }
        .joined(separator: " ")
}

public func apiSeverityLevel(_ severity: JSONValue?) -> Level {
    switch severity?.string {
    case "critical": .crit
    case "warning": .warn
    default: .ok
    }
}

public func modelLabel(_ name: String) -> String {
    knownModels[name] ?? humanize(name)
}

private func limitRole(_ entry: JSONValue) -> WindowRole {
    let kind = entry.field("kind")?.string
    let group = entry.field("group")?.string
    if kind == "session" || group == "session" { return .session }
    if kind == "weekly_all" { return .weekly }
    if kind == "weekly_scoped" { return .scoped }
    if group == "weekly" { return .weekly }
    return .other
}

private func limitLabel(_ entry: JSONValue) -> String {
    let model = entry.field("scope", "model", "display_name")?.nonEmptyString
    let surface = entry.field("scope", "surface")?.nonEmptyString
    var base: String
    switch entry.field("kind")?.string {
    case "session":
        base = "5 horas"
    case "weekly_all":
        base = "7 dias"
    case "weekly_scoped":
        base = model.map { "7 dias \($0)" } ?? "7 dias (por modelo)"
    default:
        base = humanize(entry.field("kind")?.nonEmptyString ?? entry.field("group")?.nonEmptyString ?? "uso")
        if let model { base += " \(model)" }
    }
    return surface.map { "\(base) · \(humanize($0))" } ?? base
}

private func limitKey(_ entry: JSONValue) -> String {
    var parts = ["limit", entry.field("kind")?.nonEmptyString ?? "?", entry.field("group")?.nonEmptyString ?? "?"]
    let model = entry.field("scope", "model", "display_name")?.nonEmptyString ?? entry.field("scope", "model", "id")?.nonEmptyString
    if let model { parts.append(model) }
    if let surface = entry.field("scope", "surface")?.nonEmptyString { parts.append(surface) }
    return parts.joined(separator: ":")
}

private func fromLimit(_ entry: JSONValue, utilization: Double) -> UsageWindow {
    let role = limitRole(entry)
    let group = entry.field("group")?.nonEmptyString
    let fallback: Double? = switch role {
    case .session: fiveHourSeconds
    case .other: nil
    default: sevenDaySeconds
    }
    let groupSeconds: Double? = switch group {
    case "session": fiveHourSeconds
    case "weekly": sevenDaySeconds
    default: nil
    }
    return UsageWindow(
        key: limitKey(entry),
        label: limitLabel(entry),
        role: role,
        utilization: utilization,
        resetsAt: entry.field("resets_at")?.nonEmptyString,
        totalSeconds: groupSeconds ?? fallback,
        apiLevel: apiSeverityLevel(entry.field("severity")),
        isActive: entry.field("is_active")?.bool == true
    )
}

private func legacyWindow(key: String, label: String, role: WindowRole, window: JSONValue?, totalSeconds: Double) -> UsageWindow? {
    guard let utilization = window?.field("utilization")?.finiteNumber else { return nil }
    return UsageWindow(
        key: "legacy:\(key)",
        label: label,
        role: role,
        utilization: utilization,
        resetsAt: window?.field("resets_at")?.nonEmptyString,
        totalSeconds: totalSeconds,
        apiLevel: .ok,
        isActive: false
    )
}

public func normalizeWindows(_ usage: JSONValue?) -> [UsageWindow] {
    guard let fields = usage?.object else { return [] }
    if let limits = fields["limits"]?.array {
        let windows = limits.compactMap { entry -> UsageWindow? in
            guard entry.object != nil, let utilization = entry.field("percent")?.finiteNumber else { return nil }
            return fromLimit(entry, utilization: utilization)
        }
        if !windows.isEmpty {
            return windows.enumerated()
                .sorted { ($0.element.role.rawValue, $0.offset) < ($1.element.role.rawValue, $1.offset) }
                .map(\.element)
        }
    }
    var windows: [UsageWindow?] = [
        legacyWindow(key: "five_hour", label: "5 horas", role: .session, window: fields["five_hour"], totalSeconds: fiveHourSeconds),
        legacyWindow(key: "seven_day", label: "7 dias", role: .weekly, window: fields["seven_day"], totalSeconds: sevenDaySeconds),
    ]
    for key in fields.keys.sorted() where key.hasPrefix("seven_day_") {
        let model = String(key.dropFirst("seven_day_".count))
        guard !model.isEmpty else { continue }
        windows.append(
            legacyWindow(key: key, label: "7 dias \(modelLabel(model))", role: .scoped, window: fields[key], totalSeconds: sevenDaySeconds)
        )
    }
    return windows.compactMap { $0 }
}

private func formatMinor(_ money: JSONValue?) -> String? {
    guard let amount = money?.field("amount_minor")?.finiteNumber else { return nil }
    let exponent = Int(money?.field("exponent")?.finiteNumber ?? 2)
    let currency = money?.field("currency")?.nonEmptyString
    let value = amount / pow(10, Double(exponent))
    return "\(currency.map { "\($0) " } ?? "")\(String(format: "%.\(exponent)f", value))"
}

public func normalizeSpend(_ usage: JSONValue?) -> Spend? {
    let spend = usage?.field("spend")
    if spend?.field("enabled")?.bool == true {
        let used = formatMinor(spend?.field("used"))
        let limit = formatMinor(spend?.field("limit")) ?? formatMinor(spend?.field("cap", "money")) ?? formatMinor(spend?.field("cap", "credits"))
        if used != nil || limit != nil {
            return Spend(used: used, limit: limit, percent: spend?.field("percent")?.finiteNumber, level: apiSeverityLevel(spend?.field("severity")))
        }
    }
    let extra = usage?.field("extra_usage")
    guard extra?.field("is_enabled")?.bool == true else { return nil }
    let places = Int(extra?.field("decimal_places")?.finiteNumber ?? 2)
    let currency = extra?.field("currency")?.nonEmptyString
    func money(_ value: Double?) -> String? {
        guard let value else { return nil }
        return "\(currency.map { "\($0) " } ?? "")\(String(format: "%.\(places)f", value / pow(10, Double(places))))"
    }
    let used = money(extra?.field("used_credits")?.finiteNumber)
    let monthlyLimit = extra?.field("monthly_limit")?.finiteNumber
    let limit = monthlyLimit.flatMap { $0 > 0 ? money($0) : nil }
    if used == nil && limit == nil { return nil }
    let utilization = extra?.field("utilization")?.finiteNumber
    return Spend(used: used ?? money(0), limit: limit, percent: utilization.map { $0.rounded() }, level: .ok)
}

private func resetDate(_ resetsAt: String?) -> Date? {
    resetsAt.flatMap(parseISODate)
}

public func pacePercent(resetsAt: String?, totalSeconds: Double?, now: Date) -> Double? {
    guard let reset = resetDate(resetsAt), let totalSeconds, totalSeconds > 0 else { return nil }
    let remaining = reset.timeIntervalSince(now)
    if remaining <= 0 { return nil }
    return max(0, (1 - remaining / totalSeconds) * 100)
}

public func shownPercent(_ utilization: Double, remaining: Bool) -> Double {
    remaining ? max(0, 100 - utilization.rounded()) : utilization
}

public func shownPace(_ pace: Double?, remaining: Bool) -> Double? {
    guard let pace, remaining else { return pace }
    return 100 - pace
}

public func tierLabel(plan: String?, rateLimitTier: String?) -> String {
    var base = (plan ?? "")
        .replacing(/^claude[_-]/.ignoresCase(), with: "")
        .replacing(/[_-]+/, with: " ")
        .trimmingCharacters(in: .whitespaces)
        .uppercased()
    if base.isEmpty { base = "CLAUDE" }
    if let match = (rateLimitTier ?? "").firstMatch(of: /(\d+)x/) {
        return "\(base) \(match.1)x"
    }
    return base
}

public func tierIcon(_ label: String) -> TierIcon? {
    let first = label.trimmingCharacters(in: .whitespaces).lowercased().split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
    return TierIcon(rawValue: first)
}

private func utilizationLevel(_ utilization: Double) -> Level {
    if utilization >= 90 { return .crit }
    if utilization >= 75 { return .warn }
    return .ok
}

private struct Span {
    let elapsed: Double
    let remaining: Double
    let total: Double
}

private func span(_ window: LevelInput, now: Date) -> Span? {
    guard let reset = resetDate(window.resetsAt), let total = window.totalSeconds, total != 0 else { return nil }
    let remaining = reset.timeIntervalSince(now)
    if remaining <= 0 { return nil }
    let elapsed = total - remaining
    if elapsed <= 0 || elapsed / total < 0.05 { return nil }
    return Span(elapsed: elapsed, remaining: remaining, total: total)
}

private func projectedUtilization(_ window: LevelInput, now: Date) -> Double {
    guard let span = span(window, now: now) else { return window.utilization }
    return max(window.utilization, window.utilization * span.total / span.elapsed)
}

private func exhaustSeconds(_ window: LevelInput, now: Date) -> Double? {
    guard let span = span(window, now: now), window.utilization > 0 else { return nil }
    let toExhaust = span.elapsed * (100 - window.utilization) / window.utilization
    return toExhaust > 0 && toExhaust < span.remaining ? toExhaust : nil
}

private func lockoutSeconds(_ window: LevelInput, now: Date) -> Double? {
    guard let exhaust = exhaustSeconds(window, now: now), let span = span(window, now: now) else { return nil }
    return max(0, span.remaining - exhaust)
}

public func effectiveLevel(_ window: LevelInput, now: Date) -> Level {
    var level = utilizationLevel(window.utilization)
    if let lockout = lockoutSeconds(window, now: now), let total = window.totalSeconds, total != 0 {
        level = max(level, lockout >= total * lockoutCritFraction ? .crit : .warn)
    } else if projectedUtilization(window, now: now) >= 75 {
        level = max(level, .warn)
    }
    return max(level, window.apiLevel)
}

public func displayLevel(_ window: LevelInput, now: Date) -> Level {
    if effectiveLevel(window, now: now) == .crit { return .crit }
    return window.utilization >= displayWarnUtilization || window.apiLevel == .warn ? .warn : .ok
}

public func humanDuration(_ seconds: Double) -> String {
    let total = Int(max(0, seconds.rounded(.down)))
    if total < 60 { return "\(total)s" }
    let minutes = Int((Double(total) / 60).rounded())
    if minutes < 60 { return "\(minutes)m" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h \(minutes % 60)m" }
    return "\(hours / 24)d \(hours % 24)h"
}

public func projectionNote(_ window: LevelInput, remaining: Bool, now: Date) -> String {
    if let lockout = lockoutSeconds(window, now: now), let total = window.totalSeconds, total != 0 {
        if lockout >= total * lockoutCritFraction {
            return "ritmo alto: acaba em ~\(humanDuration(exhaustSeconds(window, now: now) ?? 0))"
        }
        return "no ritmo atual acaba pouco antes do reset"
    }
    let projected = projectedUtilization(window, now: now)
    if projected < 75 || projected.rounded() <= window.utilization.rounded() { return "" }
    return remaining
        ? "tendência de ~\(Int(shownPercent(projected, remaining: true)))% restante até o reset"
        : "tendência de ~\(Int(projected.rounded()))% até o reset"
}

public func relativeReset(_ resetsAt: String?, now: Date) -> String {
    guard let reset = resetDate(resetsAt) else { return "" }
    let seconds = reset.timeIntervalSince(now)
    if seconds <= 0 { return "reiniciando…" }
    return "reinicia em \(humanDuration(seconds))"
}

public func accountSummary(_ profile: JSONValue?) -> AccountSummary? {
    guard let account = profile?.field("account"), account.object != nil else { return nil }
    let who = account.field("display_name")?.nonEmptyString ?? account.field("full_name")?.nonEmptyString
    let application = profile?.field("application", "name")?.nonEmptyString ?? "Claude"
    let active = profile?.field("organization", "subscription_status")?.string == "active"
    let status = active ? "\(application) · ativo" : application
    let plan: String? = profile?.field("organization", "organization_type")?.nonEmptyString
        ?? (account.field("has_claude_max")?.bool == true ? "max" : account.field("has_claude_pro")?.bool == true ? "pro" : nil)
    return AccountSummary(
        who: who,
        plan: plan,
        rateLimitTier: profile?.field("organization", "rate_limit_tier")?.nonEmptyString,
        subtitle: who.map { "\($0) · \(status)" } ?? status
    )
}

public func claudeErrorMessage(status: Int?, apiMessage: String?) -> String {
    switch status {
    case nil: "Não foi possível falar com o Claude."
    case 401: "Sessão expirada. Entre de novo no Claude Code."
    case 403: apiMessage ?? "Sem assinatura ativa do Claude nesta conta."
    case 429: "Limite de requisições do Claude; tentando de novo em breve."
    case let code?: "Erro do Claude (HTTP \(code))."
    }
}

public enum ProfileStatus: Sendable {
    case loading
    case ok
    case error
    case signedOut
}

public struct ProfileUsage: Equatable, Sendable {
    public let profile: ClaudeProfile
    public let active: Bool
    public let status: ProfileStatus
    public let windows: [UsageWindow]
    public let spend: Spend?
    public let tier: String?
    public let subtitle: String?
    public let error: String?
    public let updatedAt: Date?

    public init(
        profile: ClaudeProfile,
        active: Bool,
        status: ProfileStatus = .loading,
        windows: [UsageWindow] = [],
        spend: Spend? = nil,
        tier: String? = nil,
        subtitle: String? = nil,
        error: String? = nil,
        updatedAt: Date? = nil
    ) {
        self.profile = profile
        self.active = active
        self.status = status
        self.windows = windows
        self.spend = spend
        self.tier = tier
        self.subtitle = subtitle
        self.error = error
        self.updatedAt = updatedAt
    }
}
