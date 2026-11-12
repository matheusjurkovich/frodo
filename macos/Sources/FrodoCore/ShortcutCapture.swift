public enum ShortcutClaim: Equatable, Sendable {
    case ok
    case same
    case conflict
}

public func capturedShortcut(key: String, control: Bool, option: Bool, shift: Bool, command: Bool) -> String? {
    guard control || option || command else { return nil }
    let flags = [(ShortcutModifier.control, control), (.option, option), (.shift, shift), (.command, command)]
    let modifiers = flags.filter(\.1).map(\.0)
    let shortcut = Shortcut(key: key.lowercased(), modifiers: modifiers)
    return parseShortcut(shortcut.text)?.text
}

public func claimShortcut(_ candidate: String, current: String, other: String) -> ShortcutClaim {
    if candidate == current { return .same }
    return candidate == other ? .conflict : .ok
}
