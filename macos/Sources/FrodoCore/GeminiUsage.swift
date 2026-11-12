import Foundation

private let pacific = TimeZone(identifier: "America/Los_Angeles") ?? .gmt
private let perMinuteLimit = 60
private let minuteLength: TimeInterval = 60
private let hashLength = 64
private let maxCount = 1e15
private let geminiFamilies = ["gemini-pro", "gemini-flash", "gemini-other"]
private let droppedWords: Set<String> = ["preview", "exp", "latest"]
private let geminiPlans = [1000: "Login Google", 1500: "Standard", 2000: "Enterprise"]

public struct GeminiRequest: Equatable, Sendable {
    public let id: String
    public let at: Date
    public let model: String
    public let input: Int
    public let output: Int
    public let cacheRead: Int

    public init(id: String, at: Date, model: String, input: Int, output: Int, cacheRead: Int) {
        self.id = id
        self.at = at
        self.model = model
        self.input = input
        self.output = output
        self.cacheRead = cacheRead
    }
}

public struct GeminiSession: Equatable, Sendable {
    public let id: String
    public let requests: [GeminiRequest]

    public init(id: String, requests: [GeminiRequest]) {
        self.id = id
        self.requests = requests
    }
}

public struct GeminiQuota: Equatable, Sendable {
    public let requests: Int
    public let limit: Int
    public let perMinute: Int
    public let resetsAt: Date

    public init(requests: Int, limit: Int, perMinute: Int, resetsAt: Date) {
        self.requests = requests
        self.limit = limit
        self.perMinute = perMinute
        self.resetsAt = resetsAt
    }
}

private func count(_ value: JSONValue?) -> Int {
    guard case let .number(number)? = value, number.isFinite, abs(number) < maxCount else { return 0 }
    return Int(number)
}

private func capitalized(_ word: String) -> String {
    word.prefix(1).uppercased() + word.dropFirst()
}

private func request(_ value: JSONValue) -> GeminiRequest? {
    guard let object = value.object, object["type"]?.string == "gemini", let tokens = object["tokens"]?.object,
        let id = object["id"]?.string, let at = object["timestamp"]?.string.flatMap(parseISODate)
    else { return nil }
    let cached = count(tokens["cached"])
    return GeminiRequest(
        id: id,
        at: at,
        model: object["model"]?.string ?? "",
        input: max(0, count(tokens["input"]) - cached) + count(tokens["tool"]),
        output: count(tokens["output"]) + count(tokens["thoughts"]),
        cacheRead: cached
    )
}

private func records(_ content: String) -> [JSONValue] {
    if let whole = JSONValue(text: content) {
        return [whole] + (whole.object?["messages"]?.array ?? [])
    }
    return content.split(separator: "\n", omittingEmptySubsequences: false).compactMap { JSONValue(text: String($0)) }
}

public final class GeminiSessionParser {
    private var byId: [String: GeminiRequest] = [:]
    private var order: [String] = []
    private var id: String?

    public init() {}

    public func feed(_ content: String) {
        for raw in content.split(separator: "\n", omittingEmptySubsequences: false) { _ = line(String(raw)) }
    }

    @discardableResult
    public func line(_ raw: String) -> Bool {
        guard let record = JSONValue(text: raw) else { return false }
        ingest(record)
        return true
    }

    public func ingest(_ record: JSONValue) {
        guard let object = record.object else { return }
        if id == nil { id = object["sessionId"]?.string }
        for message in object["$set"]?.object?["messages"]?.array ?? [] { add(message) }
        add(record)
    }

    public func result() -> GeminiSession? {
        id.map { GeminiSession(id: $0, requests: order.compactMap { byId[$0] }) }
    }

    private func add(_ value: JSONValue) {
        guard let found = request(value) else { return }
        if byId[found.id] == nil { order.append(found.id) }
        byId[found.id] = found
    }
}

public func parseGeminiSession(_ content: String) -> GeminiSession? {
    let parser = GeminiSessionParser()
    for record in records(content) { parser.ingest(record) }
    return parser.result()
}

public func geminiCells(_ requests: [GeminiRequest], project: String, session: String, calendar: Calendar = .current) -> [UsageCell] {
    var cells: [String: UsageCell] = [:]
    var order: [String] = []
    for request in requests {
        let cell = UsageCell(
            hour: hourStart(request.at, calendar: calendar), model: request.model, project: project, session: session,
            input: request.input, output: request.output, cacheRead: request.cacheRead
        )
        let key = cellKey(cell)
        if cells[key] == nil { order.append(key) }
        addCell(&cells, cell)
    }
    return order.compactMap { cells[$0] }
}

public func parseProjects(_ content: String?) -> [(String, String)] {
    guard let content, let projects = JSONValue(text: content)?.object?["projects"]?.object else { return [] }
    return projects.compactMap { entry in entry.value.string.map { (entry.key, $0) } }.sorted { $0.0 < $1.0 }
}

public func projectName(_ dir: String, namesByHash: [String: String]) -> String {
    let isHash = dir.utf8.count == hashLength && dir.utf8.allSatisfy { ($0 >= 48 && $0 <= 57) || ($0 >= 97 && $0 <= 102) }
    return isHash ? namesByHash[dir] ?? "outro" : dir
}

private var pacificCalendar: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = pacific
    return calendar
}

public func pacificDayStart(_ now: Date) -> Date {
    pacificCalendar.startOfDay(for: now)
}

public func nextPacificReset(_ now: Date) -> Date {
    let calendar = pacificCalendar
    let start = calendar.startOfDay(for: now)
    return calendar.date(byAdding: .day, value: 1, to: start).map { calendar.startOfDay(for: $0) } ?? start.addingTimeInterval(24 * 3600)
}

public func geminiQuota(_ times: [Date], limit: Int, now: Date) -> GeminiQuota {
    let start = pacificDayStart(now)
    let recent = now.addingTimeInterval(-minuteLength)
    var requests = 0
    var perMinute = 0
    for at in times where at >= start && at <= now {
        requests += 1
        if at > recent { perMinute += 1 }
    }
    return GeminiQuota(requests: requests, limit: limit, perMinute: perMinute, resetsAt: nextPacificReset(now))
}

private func geminiFamily(_ model: String) -> String {
    let name = model.lowercased()
    if name.contains("flash") { return "gemini-flash" }
    if name.contains("pro") { return "gemini-pro" }
    return "gemini-other"
}

private func geminiLabel(_ model: String) -> String {
    guard model.lowercased().hasPrefix("gemini-") else { return model.isEmpty ? "Outro" : model }
    let parts = model.dropFirst(7).split(separator: "-", omittingEmptySubsequences: false).map(String.init)
    let words = parts.dropFirst().filter { word in
        !droppedWords.contains(word) && !(!word.isEmpty && word.utf8.allSatisfy { $0 >= 48 && $0 <= 57 })
    }
    return (["Gemini", parts.first ?? ""] + words.map(capitalized)).joined(separator: " ")
}

public let geminiModels = ModelGroups(order: geminiFamilies, family: geminiFamily, label: geminiLabel)

private func grouped(_ number: Int) -> String {
    let digits = String(abs(number))
    var out = ""
    for (index, digit) in digits.enumerated() {
        if index > 0 && (digits.count - index) % 3 == 0 { out += "." }
        out.append(digit)
    }
    return number < 0 ? "-\(out)" : out
}

public func geminiMeters(_ quota: GeminiQuota?, calendar: Calendar = .current) -> [Meter] {
    guard let quota else { return [] }
    return [
        Meter(
            key: "daily",
            label: "Pedidos hoje (estimado)",
            short: "Pedidos hoje",
            percent: quota.limit > 0 ? Double(quota.requests) / Double(quota.limit) * 100 : 0,
            note: "\(grouped(quota.requests)) de \(grouped(quota.limit)) · reinicia às \(clockTime(quota.resetsAt, calendar: calendar))"
        ),
        Meter(
            key: "minute",
            label: "Pedidos por minuto (estimado)",
            short: "Por minuto",
            percent: Double(quota.perMinute) / Double(perMinuteLimit) * 100,
            note: "\(quota.perMinute) de \(perMinuteLimit) no último minuto"
        ),
    ]
}

public func geminiPlanLabel(_ limit: Int) -> String? {
    geminiPlans[limit]
}
