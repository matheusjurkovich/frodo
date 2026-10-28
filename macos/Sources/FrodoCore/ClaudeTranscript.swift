import Foundation

public struct UsageRecord: Equatable, Sendable {
    public let id: String
    public let timestamp: Date
    public let model: String
    public let project: String
    public let sessionId: String
    public let input: Int
    public let output: Int
    public let cacheRead: Int
    public let cacheWrite: Int

    public init(
        id: String,
        timestamp: Date,
        model: String,
        project: String,
        sessionId: String,
        input: Int,
        output: Int,
        cacheRead: Int,
        cacheWrite: Int
    ) {
        self.id = id
        self.timestamp = timestamp
        self.model = model
        self.project = project
        self.sessionId = sessionId
        self.input = input
        self.output = output
        self.cacheRead = cacheRead
        self.cacheWrite = cacheWrite
    }
}

public struct TodoProgress: Equatable, Sendable {
    public let done: Int
    public let total: Int

    public init(done: Int, total: Int) {
        self.done = done
        self.total = total
    }
}

public struct TranscriptEntry: Equatable, Sendable {
    public let usage: UsageRecord
    public let branch: String?
    public let todos: TodoProgress?
    public let sidechain: Bool

    public init(usage: UsageRecord, branch: String?, todos: TodoProgress?, sidechain: Bool) {
        self.usage = usage
        self.branch = branch
        self.todos = todos
        self.sidechain = sidechain
    }
}

public enum ModelFamily: String, CaseIterable, Sendable {
    case opus = "Opus"
    case sonnet = "Sonnet"
    case haiku = "Haiku"
    case other = "Outro"
}

private let syntheticModel = "<synthetic>"
private let assistantMark = #""type":"assistant""#
private let smallWindow = 200_000
private let largeWindow = 1_000_000

private func count(_ value: JSONValue?) -> Int {
    guard case let .number(number)? = value, number.isFinite else { return 0 }
    return Int(number)
}

private func todos(of content: JSONValue?) -> TodoProgress? {
    guard let blocks = content?.array else { return nil }
    var result: TodoProgress?
    for block in blocks {
        guard block.field("type")?.string == "tool_use", block.field("name")?.string == "TodoWrite" else { continue }
        guard let items = block.field("input", "todos")?.array else { continue }
        let done = items.filter { $0.field("status")?.string == "completed" }.count
        result = TodoProgress(done: done, total: items.count)
    }
    return result
}

public func parseAssistantLine(_ line: String) -> TranscriptEntry? {
    guard line.contains(assistantMark), let data = JSONValue(text: line) else { return nil }
    guard data.field("type")?.string == "assistant", let message = data.field("message"), message.object != nil,
        let usage = message.field("usage"), usage.object != nil
    else { return nil }
    guard let id = message.field("id")?.nonEmptyString,
        let model = message.field("model")?.nonEmptyString, model != syntheticModel,
        let sessionId = data.field("sessionId")?.nonEmptyString,
        let timestamp = data.field("timestamp")?.string.flatMap(parseISODate)
    else { return nil }
    let project = (data.field("cwd")?.nonEmptyString ?? "").split(separator: "/").last.map(String.init) ?? ""
    return TranscriptEntry(
        usage: UsageRecord(
            id: id,
            timestamp: timestamp,
            model: model,
            project: project,
            sessionId: sessionId,
            input: count(usage.field("input_tokens")),
            output: count(usage.field("output_tokens")),
            cacheRead: count(usage.field("cache_read_input_tokens")),
            cacheWrite: count(usage.field("cache_creation_input_tokens"))
        ),
        branch: data.field("gitBranch")?.nonEmptyString,
        todos: todos(of: message.field("content")),
        sidechain: data.field("isSidechain")?.bool == true
    )
}

public func completeLines(_ bytes: Data) -> (text: String, consumed: Int) {
    guard let lastNewline = bytes.lastIndex(of: 0x0A) else { return ("", 0) }
    let consumed = bytes.distance(from: bytes.startIndex, to: lastNewline) + 1
    return (String(decoding: bytes.prefix(consumed), as: UTF8.self), consumed)
}

public func modelFamily(_ model: String) -> ModelFamily {
    let name = model.lowercased()
    if name.contains("opus") { return .opus }
    if name.contains("sonnet") { return .sonnet }
    if name.contains("haiku") { return .haiku }
    return .other
}

public func modelDisplayName(_ model: String) -> String {
    let family = modelFamily(model)
    if family == .other { return model }
    let version = model
        .replacing(/\[.*\]$/, with: "")
        .components(separatedBy: "-")
        .filter { $0.count <= 2 && !$0.isEmpty && $0.allSatisfy(\.isASCII) && $0.allSatisfy(\.isNumber) }
        .joined(separator: ".")
    return version.isEmpty ? family.rawValue : "\(family.rawValue) \(version)"
}

public func contextWindow(_ contextTokens: Int) -> Int {
    contextTokens > smallWindow ? largeWindow : smallWindow
}
