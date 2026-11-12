import Foundation

public struct RateWindow: Equatable, Sendable {
    public let usedPercent: Double
    public let windowMinutes: Int
    public let resetsAt: Date

    public init(usedPercent: Double, windowMinutes: Int, resetsAt: Date) {
        self.usedPercent = usedPercent
        self.windowMinutes = windowMinutes
        self.resetsAt = resetsAt
    }
}

public struct CodexLimits: Equatable, Sendable {
    public let plan: String?
    public let primary: RateWindow?
    public let secondary: RateWindow?
    public let at: Date

    public init(plan: String?, primary: RateWindow?, secondary: RateWindow?, at: Date) {
        self.plan = plan
        self.primary = primary
        self.secondary = secondary
        self.at = at
    }
}

public struct CodexSession: Equatable, Sendable {
    public var model: String
    public var tokens: Int
    public var contextTokens: Int
    public var contextWindow: Int
    public var startedAt: Date
    public var lastAt: Date
}

public struct CodexLine: Equatable, Sendable {
    public let at: Date
    public let type: String
    public let payload: [String: JSONValue]
}

public struct CodexRollout: Equatable, Sendable {
    public let id: String?
    public let cells: [UsageCell]
    public let session: CodexSession?
    public let limits: CodexLimits?
}

private let codexFamilies = ["codex-gpt", "codex-codex", "codex-mini", "codex-other"]
private let dayDirSlack: TimeInterval = 24 * 3600
private let limitsMark = #""rate_limits""#

private func count(_ value: JSONValue?) -> Int {
    boundedInteger(value) ?? 0
}

private func capitalized(_ word: Substring) -> String {
    word.prefix(1).uppercased() + word.dropFirst()
}

public func parseCodexLine(_ line: String) -> CodexLine? {
    guard let data = JSONValue(text: line), let object = data.object,
        let type = object["type"]?.string, let payload = object["payload"]?.object,
        let at = object["timestamp"]?.string.flatMap(parseISODate)
    else { return nil }
    return CodexLine(at: at, type: type, payload: payload)
}

private func rateWindow(_ value: JSONValue?, at: Date) -> RateWindow? {
    guard let object = value?.object, case let .number(used)? = object["used_percent"] else { return nil }
    let resetsAt: Date
    if case let .number(seconds)? = object["resets_at"] {
        resetsAt = Date(timeIntervalSince1970: seconds)
    } else if case let .number(seconds)? = object["resets_in_seconds"] {
        resetsAt = at.addingTimeInterval(seconds)
    } else {
        return nil
    }
    return RateWindow(usedPercent: used, windowMinutes: count(object["window_minutes"]), resetsAt: resetsAt)
}

private func codexLimits(of line: CodexLine) -> CodexLimits? {
    guard line.type == "event_msg", line.payload["type"]?.string == "token_count",
        let rates = line.payload["rate_limits"]?.object
    else { return nil }
    return CodexLimits(
        plan: rates["plan_type"]?.nonEmptyString,
        primary: rateWindow(rates["primary"], at: line.at),
        secondary: rateWindow(rates["secondary"], at: line.at),
        at: line.at
    )
}

public func latestLimits(_ content: String) -> CodexLimits? {
    for raw in content.split(separator: "\n", omittingEmptySubsequences: false).reversed() {
        let line = String(raw)
        guard line.contains(limitsMark), let parsed = parseCodexLine(line), let found = codexLimits(of: parsed) else { continue }
        return found
    }
    return nil
}

public final class RolloutParser {
    public private(set) var id: String?
    public private(set) var session: CodexSession?
    public private(set) var limits: CodexLimits?
    private var cellMap: [String: UsageCell] = [:]
    private var cellOrder: [String] = []
    private var project = ""
    private var model = ""
    private var previousTotal: Double?
    private let calendar: Calendar

    public init(calendar: Calendar = .current) {
        self.calendar = calendar
    }

    public var cells: [UsageCell] {
        cellOrder.compactMap { cellMap[$0] }
    }

    public func feed(_ text: String) {
        for raw in text.split(separator: "\n", omittingEmptySubsequences: false) { _ = line(String(raw)) }
    }

    @discardableResult
    public func line(_ raw: String) -> Bool {
        guard let parsed = parseCodexLine(raw) else { return false }
        let payload = parsed.payload
        if parsed.type == "session_meta" {
            id = id ?? payload["id"]?.nonEmptyString
            project = (payload["cwd"]?.nonEmptyString ?? "").split(separator: "/").last.map(String.init) ?? ""
            return true
        }
        if parsed.type == "turn_context" {
            model = payload["model"]?.nonEmptyString ?? model
            return true
        }
        guard parsed.type == "event_msg", payload["type"]?.string == "token_count" else { return true }
        limits = codexLimits(of: parsed) ?? limits
        tally(parsed, payload)
        return true
    }

    private func tally(_ line: CodexLine, _ payload: [String: JSONValue]) {
        guard let info = payload["info"]?.object, let last = info["last_token_usage"]?.object else { return }
        if case let .number(total)? = info["total_token_usage"]?.object?["total_tokens"] {
            if total == previousTotal { return }
            previousTotal = total
        }
        let cached = count(last["cached_input_tokens"])
        let input = max(0, count(last["input_tokens"]) - cached)
        let output = count(last["output_tokens"])
        if input + cached + output == 0 { return }
        let cell = UsageCell(
            hour: hourStart(line.at, calendar: calendar), model: model, project: project, session: id ?? "",
            input: input, output: output, cacheRead: cached
        )
        let key = cellKey(cell)
        if cellMap[key] == nil { cellOrder.append(key) }
        addCell(&cellMap, cell)
        var current = session ?? CodexSession(model: model, tokens: 0, contextTokens: 0, contextWindow: 0, startedAt: line.at, lastAt: line.at)
        current.model = model
        current.tokens += input + output
        current.contextTokens = input + cached + output
        let window = count(info["model_context_window"])
        current.contextWindow = window == 0 ? current.contextWindow : window
        current.lastAt = line.at
        session = current
    }
}

public func readRollout(_ content: String, calendar: Calendar = .current) -> CodexRollout {
    let parser = RolloutParser(calendar: calendar)
    parser.feed(content)
    return CodexRollout(id: parser.id, cells: parser.cells, session: parser.id == nil ? nil : parser.session, limits: parser.limits)
}

public func dayDirEnded(_ parts: [String], since: Date, calendar: Calendar = .current) -> Bool {
    let numbers = parts.prefix(3).map { Int($0) }
    guard let first = numbers.first, let year = first else { return false }
    if numbers.dropFirst().contains(where: { $0 == nil }) { return false }
    let month = numbers.count > 1 ? numbers[1] : nil
    let day = numbers.count > 2 ? numbers[2] : nil
    let unit: Calendar.Component = month == nil ? .year : day == nil ? .month : .day
    guard let start = calendar.date(from: DateComponents(year: year, month: month ?? 1, day: day ?? 1)),
        let end = calendar.date(byAdding: unit, value: 1, to: start)
    else { return false }
    return end.addingTimeInterval(dayDirSlack) <= since
}

public func planLabel(_ plan: String?) -> String? {
    guard let plan, !plan.isEmpty else { return nil }
    return plan.split(whereSeparator: { $0 == "_" || $0 == "-" || $0.isWhitespace }).map(capitalized).joined(separator: " ")
}

private func codexFamily(_ model: String) -> String {
    let name = model.lowercased()
    if name.contains("mini") { return "codex-mini" }
    if name.contains("codex") { return "codex-codex" }
    if name.hasPrefix("gpt") { return "codex-gpt" }
    return "codex-other"
}

private func codexLabel(_ model: String) -> String {
    guard model.lowercased().hasPrefix("gpt-") else { return model.isEmpty ? "Outro" : model }
    let parts = model.dropFirst(4).split(separator: "-", omittingEmptySubsequences: false)
    let version = parts.first.map(String.init) ?? ""
    return (["GPT-\(version)"] + parts.dropFirst().map(capitalized)).joined(separator: " ")
}

public let codexModels = ModelGroups(order: codexFamilies, family: codexFamily, label: codexLabel)

private func windowName(_ minutes: Int) -> String {
    if minutes > 0 && minutes % (7 * 24 * 60) == 0 { return "Semana" }
    if minutes > 0 && minutes % (24 * 60) == 0 { return "\(minutes / (24 * 60)) dias" }
    if minutes > 0 && minutes % 60 == 0 { return "Janela de \(minutes / 60) h" }
    return "Janela de \(minutes) min"
}

private func windowMeter(_ key: String, _ window: RateWindow, now: Date) -> Meter {
    let label = windowName(window.windowMinutes)
    return Meter(
        key: key,
        label: label,
        short: label.replacingOccurrences(of: "Janela de ", with: "Janela "),
        percent: window.resetsAt <= now ? 0 : window.usedPercent,
        note: resetNote(window.resetsAt, now: now)
    )
}

public func codexMeters(_ limits: CodexLimits?, now: Date) -> [Meter] {
    guard let limits else { return [] }
    var meters: [Meter] = []
    if let primary = limits.primary { meters.append(windowMeter("session", primary, now: now)) }
    if let secondary = limits.secondary { meters.append(windowMeter("weekly", secondary, now: now)) }
    return meters
}
