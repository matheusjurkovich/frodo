import Foundation

public struct HookEvent: Equatable, Sendable {
    public let provider: AiProvider
    public let sessionId: String
    public let cwd: String
    public let name: String
    public let tool: String?
    public let input: [String: JSONValue]
    public let notificationType: String?
    public let pid: Int?

    public init(
        sessionId: String, cwd: String, name: String, tool: String?, input: [String: JSONValue], notificationType: String?, pid: Int?,
        provider: AiProvider = .claude
    ) {
        self.provider = provider
        self.sessionId = sessionId
        self.cwd = cwd
        self.name = name
        self.tool = tool
        self.input = input
        self.notificationType = notificationType
        self.pid = pid
    }
}

private let stepKeys = ["command", "file_path", "notebook_path", "absolute_path", "pattern", "description", "url", "query"]

private let eventAliases = [
    "BeforeAgent": "UserPromptSubmit",
    "BeforeTool": "PreToolUse",
    "AfterTool": "PostToolUse",
    "AfterAgent": "Stop",
    "PreCompress": "PreCompact",
]

private let notificationAliases = ["ToolPermission": "permission_prompt"]

private func basename(_ path: String) -> String {
    path.replacing(/\/+$/, with: "").split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? ""
}

public func parseHookEvent(_ text: String) -> HookEvent? {
    guard let data = JSONValue(text: text), let event = data.field("event"), event.object != nil,
        let sessionId = event.field("session_id")?.nonEmptyString, let cwd = event.field("cwd")?.string,
        let name = event.field("hook_event_name")?.string
    else { return nil }
    let notificationType = event.field("notification_type")?.string
    return HookEvent(
        sessionId: sessionId,
        cwd: cwd,
        name: eventAliases[name] ?? name,
        tool: event.field("tool_name")?.string,
        input: event.field("tool_input")?.object ?? [:],
        notificationType: notificationType.map { notificationAliases[$0] ?? $0 },
        pid: safePositiveInteger(data.field("pid")),
        provider: data.field("provider")?.string.flatMap(AiProvider.init(rawValue:)) ?? .claude
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
        pid: next.pid, since: since, updatedAt: next.updatedAt, provider: next.provider
    )
}

private func transition(previous: SessionState?, event: HookEvent, at moment: Date) -> SessionState? {
    if event.name == "SessionEnd" { return nil }
    func state(_ status: SessionStatus, _ tool: String?, _ step: String) -> SessionState {
        SessionState(
            sessionId: event.sessionId, cwd: event.cwd, repo: basename(event.cwd), status: status, tool: tool, step: step,
            pid: event.pid ?? previous?.pid, since: moment, updatedAt: moment, provider: event.provider
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
