import Foundation

public struct ClaudeProfile: Equatable, Sendable {
    public let id: String
    public let label: String
    public let configDir: String

    public init(id: String, label: String, configDir: String) {
        self.id = id
        self.label = label
        self.configDir = configDir
    }
}

public func parseProfiles(_ text: String) -> [ClaudeProfile] {
    guard let items = JSONValue(text: text)?.array else { return [] }
    return items.compactMap { item in
        guard item.object != nil, let configDir = item.field("configDir")?.nonEmptyString else { return nil }
        return ClaudeProfile(id: item.field("id")?.string ?? configDir, label: item.field("label")?.string ?? "Claude", configDir: configDir)
    }
}

public func expandHome(_ path: String, home: String) -> String {
    let trimmed = path.trimmingCharacters(in: .whitespaces).replacing(/(.)\/+$/, with: { $0.1 })
    if trimmed == "~" { return home }
    return trimmed.hasPrefix("~/") ? home + trimmed.dropFirst() : trimmed
}

public func labelForDirName(_ name: String) -> String {
    if name == ".claude" { return "Claude" }
    let words = name
        .replacing(/^\.claude-/, with: "")
        .split(whereSeparator: { $0 == "-" || $0 == "_" })
        .map { $0.prefix(1).uppercased() + $0.dropFirst() }
    return words.isEmpty ? "Claude" : words.joined(separator: " ")
}

public func profileChip(_ label: String) -> String {
    let words = label.trimmingCharacters(in: .whitespaces).split(whereSeparator: \.isWhitespace)
    if words.count >= 2, let first = words[0].first, let second = words[1].first {
        return "\(first)\(second)".uppercased()
    }
    let chip = String(label.prefix(2)).uppercased()
    return chip.isEmpty ? "?" : chip
}

private func trimSlashes(_ path: String) -> String {
    path.replacing(/\/+$/, with: "")
}

public func isActiveProfile(_ profile: ClaudeProfile, defaultConfigDir: String) -> Bool {
    trimSlashes(profile.configDir) == trimSlashes(defaultConfigDir)
}
