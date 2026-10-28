public enum ShortcutModifier: String, CaseIterable, Sendable {
    case control = "ctrl"
    case option = "opt"
    case shift
    case command = "cmd"

    public var symbol: String {
        switch self {
        case .control: "⌃"
        case .option: "⌥"
        case .shift: "⇧"
        case .command: "⌘"
        }
    }
}

public struct Shortcut: Equatable, Sendable {
    public let key: String
    public let modifiers: [ShortcutModifier]

    public init(key: String, modifiers: [ShortcutModifier]) {
        self.key = key
        self.modifiers = modifiers
    }

    public var display: String {
        modifiers.map(\.symbol).joined() + key.uppercased()
    }

    public var text: String {
        (modifiers.map(\.rawValue) + [key]).joined(separator: "+")
    }
}

public func parseShortcut(_ text: String) -> Shortcut? {
    let parts = text.lowercased().split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces) }
    guard let key = parts.last, key.count == 1, key.first?.isLetter == true || key.first?.isNumber == true else { return nil }
    var modifiers: [ShortcutModifier] = []
    for name in parts.dropLast() {
        guard let modifier = ShortcutModifier(rawValue: name), !modifiers.contains(modifier) else { return nil }
        modifiers.append(modifier)
    }
    let ordered = ShortcutModifier.allCases.filter { modifiers.contains($0) }
    return ordered.isEmpty ? nil : Shortcut(key: key, modifiers: ordered)
}
