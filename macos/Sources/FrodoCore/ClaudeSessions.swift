import Foundation

public enum SessionStatus: CaseIterable, Sendable {
    case working
    case waiting
    case done
    case idle
}

public struct SessionState: Equatable, Sendable {
    public let sessionId: String
    public let cwd: String
    public let repo: String
    public let status: SessionStatus
    public let tool: String?
    public let step: String
    public let pid: Int?
    public let since: Date
    public let updatedAt: Date

    public init(
        sessionId: String,
        cwd: String,
        repo: String,
        status: SessionStatus,
        tool: String?,
        step: String,
        pid: Int?,
        since: Date,
        updatedAt: Date
    ) {
        self.sessionId = sessionId
        self.cwd = cwd
        self.repo = repo
        self.status = status
        self.tool = tool
        self.step = step
        self.pid = pid
        self.since = since
        self.updatedAt = updatedAt
    }
}

public struct PendingRequest: Equatable, Sendable {
    public let key: String
    public let sessionId: String
    public let request: String
    public let pid: Int
    public let tool: String
    public let since: Date

    public init(key: String, sessionId: String, request: String, pid: Int, tool: String, since: Date) {
        self.key = key
        self.sessionId = sessionId
        self.request = request
        self.pid = pid
        self.tool = tool
        self.since = since
    }
}

private let idleAfter: TimeInterval = 30 * 60

public func displayStatus(_ state: SessionState, now: Date) -> SessionStatus {
    state.status == .done && now.timeIntervalSince(state.updatedAt) > idleAfter ? .idle : state.status
}

public struct StatusCounts: Equatable, Sendable {
    public var all = 0
    public var working = 0
    public var waiting = 0
    public var done = 0
    public var idle = 0

    public init(all: Int = 0, working: Int = 0, waiting: Int = 0, done: Int = 0, idle: Int = 0) {
        self.all = all
        self.working = working
        self.waiting = waiting
        self.done = done
        self.idle = idle
    }
}

public func countByStatus(_ states: [SessionState], now: Date) -> StatusCounts {
    var counts = StatusCounts(all: states.count)
    for state in states {
        switch displayStatus(state, now: now) {
        case .working: counts.working += 1
        case .waiting: counts.waiting += 1
        case .done: counts.done += 1
        case .idle: counts.idle += 1
        }
    }
    return counts
}

public func oldestPending(_ requests: [PendingRequest], sessionId: String? = nil) -> PendingRequest? {
    requests
        .filter { sessionId == nil || $0.sessionId == sessionId }
        .reduce(nil as PendingRequest?) { oldest, request in
            guard let oldest else { return request }
            return request.since < oldest.since ? request : oldest
        }
}

public struct HookEvent: Equatable, Sendable {
    public let sessionId: String
    public let cwd: String
    public let name: String
    public let tool: String?
    public let input: [String: JSONValue]
    public let notificationType: String?
    public let pid: Int?

    public init(sessionId: String, cwd: String, name: String, tool: String?, input: [String: JSONValue], notificationType: String?, pid: Int?) {
        self.sessionId = sessionId
        self.cwd = cwd
        self.name = name
        self.tool = tool
        self.input = input
        self.notificationType = notificationType
        self.pid = pid
    }
}

public enum Decision: String, Sendable {
    case allow
    case deny
}

public struct DiffStat: Equatable, Sendable {
    public let files: Int
    public let added: Int
    public let removed: Int
}

public struct ContextUsage: Equatable, Sendable {
    public let fraction: Double
    public let warn: Bool
    public let text: String
}

private let contextWarnFraction = 0.85
private let stepKeys = ["command", "file_path", "notebook_path", "pattern", "description", "url", "query"]

private func basename(_ path: String) -> String {
    path.replacing(/\/+$/, with: "").split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? ""
}

private func safePositiveInteger(_ value: JSONValue?) -> Int? {
    guard case let .number(number)? = value, number.isFinite, number == number.rounded(), number > 0, number < 9_007_199_254_740_992 else { return nil }
    return Int(number)
}

public func parseHookEvent(_ text: String) -> HookEvent? {
    guard let data = JSONValue(text: text), let event = data.field("event"), event.object != nil,
        let sessionId = event.field("session_id")?.nonEmptyString, let cwd = event.field("cwd")?.string,
        let name = event.field("hook_event_name")?.string
    else { return nil }
    return HookEvent(
        sessionId: sessionId,
        cwd: cwd,
        name: name,
        tool: event.field("tool_name")?.string,
        input: event.field("tool_input")?.object ?? [:],
        notificationType: event.field("notification_type")?.string,
        pid: safePositiveInteger(data.field("pid"))
    )
}

public func stepFor(tool: String, input: [String: JSONValue]) -> String {
    for key in stepKeys {
        guard let value = input[key]?.string else { continue }
        let firstLine = value.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: "\n", omittingEmptySubsequences: false).first ?? ""
        let detail = firstLine.trimmingCharacters(in: .whitespaces)
        if detail.isEmpty { continue }
        return "\(tool) \(key.hasSuffix("_path") ? basename(detail) : detail)"
    }
    return tool
}

public func nextState(previous: SessionState?, event: HookEvent, at moment: Date) -> SessionState? {
    guard let next = transition(previous: previous, event: event, at: moment) else { return nil }
    let since = previous?.status == next.status ? previous?.since ?? moment : moment
    return SessionState(
        sessionId: next.sessionId, cwd: next.cwd, repo: next.repo, status: next.status, tool: next.tool, step: next.step,
        pid: next.pid, since: since, updatedAt: next.updatedAt
    )
}

private func transition(previous: SessionState?, event: HookEvent, at moment: Date) -> SessionState? {
    if event.name == "SessionEnd" { return nil }
    func state(_ status: SessionStatus, _ tool: String?, _ step: String) -> SessionState {
        SessionState(
            sessionId: event.sessionId, cwd: event.cwd, repo: basename(event.cwd), status: status, tool: tool, step: step,
            pid: event.pid ?? previous?.pid, since: moment, updatedAt: moment
        )
    }
    let keptStatus = previous?.status ?? .idle
    let keptTool = previous?.tool
    let keptStep = previous?.step ?? ""
    let tool = event.tool ?? ""
    switch event.name {
    case "SessionStart":
        return state(.idle, nil, "")
    case "UserPromptSubmit":
        return state(.working, nil, "Pensando")
    case "PreToolUse", "PostToolUse", "PostToolUseFailure":
        return state(.working, event.tool, stepFor(tool: tool, input: event.input))
    case "PermissionRequest":
        return state(.waiting, event.tool, stepFor(tool: tool, input: event.input))
    case "Notification":
        if event.notificationType == "permission_prompt" { return state(.waiting, keptTool, keptStep) }
        if event.notificationType == "idle_prompt" {
            if let previous, previous.status == .done { return previous }
            return state(.idle, keptTool, keptStep)
        }
        return previous ?? state(keptStatus, keptTool, keptStep)
    case "PreCompact":
        return state(.working, nil, "Compactando contexto")
    case "Stop":
        return state(.done, keptTool, keptStep)
    default:
        return previous ?? state(keptStatus, keptTool, keptStep)
    }
}

public func sessionMeta(_ state: SessionState, stats: SessionStats?, status: SessionStatus, now: Date) -> String {
    var parts: [String] = []
    if let model = stats?.model, !model.isEmpty { parts.append(modelDisplayName(model)) }
    if let branch = stats?.branch, !branch.isEmpty { parts.append(branch) }
    if status == .idle {
        parts.append("parada há \(formatSpan(now.timeIntervalSince(stats?.lastAt ?? state.updatedAt)))")
    } else if let stats {
        parts.append(formatSpan(now.timeIntervalSince(stats.startedAt)))
    }
    return parts.joined(separator: " · ")
}

public func contextUsage(_ contextTokens: Int) -> ContextUsage? {
    if contextTokens <= 0 { return nil }
    let window = contextWindow(contextTokens)
    let fraction = min(1, Double(contextTokens) / Double(window))
    return ContextUsage(
        fraction: fraction, warn: fraction >= contextWarnFraction, text: "\(formatTokens(contextTokens)) de \(formatTokens(window)) tokens"
    )
}

public func parseShortstat(_ text: String) -> DiffStat? {
    guard let files = text.firstMatch(of: /(\d+) files? changed/) else { return nil }
    let added = text.firstMatch(of: /(\d+) insertions?\(\+\)/).flatMap { Int($0.1) } ?? 0
    let removed = text.firstMatch(of: /(\d+) deletions?\(-\)/).flatMap { Int($0.1) } ?? 0
    return DiffStat(files: Int(files.1) ?? 0, added: added, removed: removed)
}

public func parsePending(fileName: String, text: String) -> PendingRequest? {
    guard let name = fileName.wholeMatch(of: /([A-Za-z0-9-]+)\.([A-Za-z0-9-]+)\.json/),
        let data = JSONValue(text: text), data.object != nil,
        let pid = safePositiveInteger(data.field("pid")),
        let tool = data.field("tool")?.nonEmptyString,
        case let .number(since)? = data.field("since"), since.isFinite
    else { return nil }
    let sessionId = String(name.1)
    let request = String(name.2)
    return PendingRequest(key: "\(sessionId).\(request)", sessionId: sessionId, request: request, pid: pid, tool: tool, since: Date(timeIntervalSince1970: since / 1000))
}

public func decisionJson(_ decision: Decision) -> String {
    "{\"behavior\":\"\(decision.rawValue)\"}\n"
}
