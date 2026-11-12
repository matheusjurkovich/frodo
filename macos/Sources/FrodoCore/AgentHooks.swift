import Foundation

public enum HookedAgent: String, Sendable {
    case codex
    case gemini
}

private let hookScriptName = "claude-session.sh"

private struct HookPlan {
    let events: [String]
    let matcher: String
    let extra: [String: JSONValue]
    let timeout: (String) -> Int
}

private func plan(for agent: HookedAgent) -> HookPlan {
    switch agent {
    case .codex:
        HookPlan(
            events: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop", "SessionEnd"],
            matcher: "", extra: [:], timeout: { $0 == "PermissionRequest" ? 600 : 5 }
        )
    case .gemini:
        HookPlan(
            events: ["SessionStart", "BeforeAgent", "BeforeTool", "AfterTool", "AfterAgent", "Notification", "PreCompress", "SessionEnd"],
            matcher: "*", extra: ["name": .string("frodo")], timeout: { _ in 5000 }
        )
    }
}

public func hasFrodoHooks(_ text: String?) -> Bool {
    text?.contains(hookScriptName) ?? false
}

public func withFrodoHooks(_ text: String?, agent: HookedAgent, script: String) -> String? {
    var config: [String: JSONValue] = [:]
    if let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        guard let parsed = JSONValue(text: text)?.object else { return nil }
        config = parsed
    }
    var hooks: [String: JSONValue] = [:]
    if let current = config["hooks"] {
        guard let object = current.object else { return nil }
        hooks = object
    }
    let plan = plan(for: agent)
    let command = "\(script) \(agent.rawValue)"
    for event in plan.events {
        var groups: [JSONValue] = []
        if let current = hooks[event] {
            guard let array = current.array else { return nil }
            groups = array
        }
        if renderedJSON(.array(groups)).contains(hookScriptName) { continue }
        var entry = plan.extra
        entry["type"] = .string("command")
        entry["command"] = .string(command)
        entry["timeout"] = .number(Double(plan.timeout(event)))
        groups.append(.object(["matcher": .string(plan.matcher), "hooks": .array([.object(entry)])]))
        hooks[event] = .array(groups)
    }
    config["hooks"] = .object(hooks)
    return renderedJSON(.object(config), indent: "") + "\n"
}

private func quotedJSON(_ text: String) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    return (try? encoder.encode(text)).map { String(decoding: $0, as: UTF8.self) } ?? "\"\""
}

private func renderedJSON(_ value: JSONValue, indent: String = "") -> String {
    let inner = indent + "  "
    switch value {
    case .null:
        return "null"
    case let .bool(flag):
        return flag ? "true" : "false"
    case let .number(number):
        return number.isFinite && number == number.rounded() && abs(number) < 1e15 ? String(Int(number)) : "\(number)"
    case let .string(text):
        return quotedJSON(text)
    case let .array(items):
        if items.isEmpty { return "[]" }
        return "[\n" + items.map { inner + renderedJSON($0, indent: inner) }.joined(separator: ",\n") + "\n\(indent)]"
    case let .object(fields):
        if fields.isEmpty { return "{}" }
        let lines = fields.keys.sorted().map { "\(inner)\(quotedJSON($0)): \(renderedJSON(fields[$0] ?? .null, indent: inner))" }
        return "{\n" + lines.joined(separator: ",\n") + "\n\(indent)}"
    }
}
