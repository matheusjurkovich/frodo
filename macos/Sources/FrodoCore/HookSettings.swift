import Foundation

public let claudeHookEvents = [
    "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "Notification", "PreCompact", "Stop",
    "SessionEnd",
]

public func shellQuoted(_ path: String) -> String {
    "'" + path.replacingOccurrences(of: "'", with: "'\\''") + "'"
}

public func hookSettingsJSON(scriptPath: String) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    let command = (try? encoder.encode(shellQuoted(scriptPath))).map { String(decoding: $0, as: UTF8.self) } ?? "\"\(shellQuoted(scriptPath))\""
    let entries = claudeHookEvents.map { event in
        "    \"\(event)\": [\n      {\n        \"hooks\": [\n          {\n            \"type\": \"command\",\n            \"command\": \(command)\n          }\n        ]\n      }\n    ]"
    }
    return "{\n  \"hooks\": {\n\(entries.joined(separator: ",\n"))\n  }\n}"
}
