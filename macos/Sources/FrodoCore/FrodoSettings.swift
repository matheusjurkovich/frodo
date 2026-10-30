import Foundation

public enum ClosedMode: String, CaseIterable, Sendable {
    case minimal
    case compact
    case rotating
}

public enum ClosedItem: String, CaseIterable, Sendable {
    case clock
    case date
    case notifications
    case battery
    case ram
    case claudeSession = "claude-session"
    case claudeWeekly = "claude-weekly"

    public var isText: Bool {
        switch self {
        case .battery, .ram, .claudeSession, .claudeWeekly: true
        default: false
        }
    }
}

public enum SurfaceStyle: String, CaseIterable, Sendable {
    case solid
    case frosted
    case clear
}

public enum MonitorMode: String, CaseIterable, Sendable {
    case primary
    case secondary
    case both
}

public enum CardId: String, CaseIterable, Sendable {
    case shortcuts
    case apps
}

@MainActor
public final class FrodoSettings {
    public let changed = Event<String>()

    private let defaults: UserDefaults

    public init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    private func set<Value: Sendable>(_ value: Value, for key: String) {
        defaults.set(value, forKey: key)
        changed.emit(key)
    }

    private func enumValue<Value: RawRepresentable>(_ key: String, default fallback: Value) -> Value where Value.RawValue == String {
        defaults.string(forKey: key).flatMap { Value(rawValue: $0) } ?? fallback
    }

    private func enumList<Value: RawRepresentable>(_ key: String, default fallback: [Value]) -> [Value] where Value.RawValue == String {
        guard let raw = defaults.stringArray(forKey: key) else { return fallback }
        return raw.compactMap { Value(rawValue: $0) }
    }

    private func bounded(_ key: String, default fallback: Int, range: ClosedRange<Int>) -> Int {
        guard defaults.object(forKey: key) != nil else { return fallback }
        return min(range.upperBound, max(range.lowerBound, defaults.integer(forKey: key)))
    }

    public var closedMode: ClosedMode {
        get { enumValue("closed-mode", default: .compact) }
        set { set(newValue.rawValue, for: "closed-mode") }
    }

    public var closedItems: [ClosedItem] {
        get { enumList("closed-items", default: [.clock, .date, .notifications, .battery]) }
        set { set(newValue.map(\.rawValue), for: "closed-items") }
    }

    public var rotateSeconds: Int {
        get { bounded("rotate-seconds", default: 4, range: 2 ... 30) }
        set { set(min(30, max(2, newValue)), for: "rotate-seconds") }
    }

    public var position: IslandPosition {
        get { enumValue("position", default: .topCenter) }
        set { set(newValue.rawValue, for: "position") }
    }

    public var openBlur: Bool {
        get { defaults.object(forKey: "open-blur") == nil ? true : defaults.bool(forKey: "open-blur") }
        set { set(newValue, for: "open-blur") }
    }

    public var surfaceStyle: SurfaceStyle {
        get { enumValue("surface-style", default: .solid) }
        set { set(newValue.rawValue, for: "surface-style") }
    }

    public var monitors: MonitorMode {
        get { enumValue("monitors", default: .primary) }
        set { set(newValue.rawValue, for: "monitors") }
    }

    public var claudePollMinutes: Int {
        get { bounded("claude-poll-minutes", default: 5, range: 1 ... 60) }
        set { set(min(60, max(1, newValue)), for: "claude-poll-minutes") }
    }

    public var claudeShowRemaining: Bool {
        get { defaults.bool(forKey: "claude-show-remaining") }
        set { set(newValue, for: "claude-show-remaining") }
    }

    public var claudeProfiles: [ClaudeProfile] {
        get { parseProfiles(defaults.string(forKey: "claude-profiles") ?? "[]") }
        set {
            let encoded = newValue.map { JSONValue.object(["id": .string($0.id), "label": .string($0.label), "configDir": .string($0.configDir)]) }
            let text = (try? JSONEncoder().encode(JSONValue.array(encoded))).map { String(decoding: $0, as: UTF8.self) } ?? "[]"
            set(text, for: "claude-profiles")
        }
    }

    public var claudeProfilesInitialized: Bool {
        get { defaults.bool(forKey: "claude-profiles-initialized") }
        set { set(newValue, for: "claude-profiles-initialized") }
    }

    public var meetingNoticeMinutes: Int {
        get { bounded("meeting-notice-minutes", default: 10, range: 0 ... 60) }
        set { set(min(60, max(0, newValue)), for: "meeting-notice-minutes") }
    }

    public var toggleShortcut: String {
        get { defaults.string(forKey: "toggle-shortcut") ?? "ctrl+opt+z" }
        set { set(newValue, for: "toggle-shortcut") }
    }

    public var claudeShortcut: String {
        get { defaults.string(forKey: "claude-shortcut") ?? "ctrl+opt+shift+z" }
        set { set(newValue, for: "claude-shortcut") }
    }

    public var openOnHover: Bool {
        get { defaults.object(forKey: "open-on-hover") == nil ? true : defaults.bool(forKey: "open-on-hover") }
        set { set(newValue, for: "open-on-hover") }
    }

    public var autoClose: Bool {
        get { defaults.bool(forKey: "auto-close") }
        set { set(newValue, for: "auto-close") }
    }

    public var hiddenTabs: [TabId] {
        get { enumList("hidden-tabs", default: []) }
        set { set(newValue.map(\.rawValue), for: "hidden-tabs") }
    }

    public var collapsedCards: [CardId] {
        get { enumList("collapsed-cards", default: []) }
        set { set(newValue.map(\.rawValue), for: "collapsed-cards") }
    }

    public func onChanged(_ keys: [String], _ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        changed.on { key in
            if keys.contains(key) { handler() }
        }
    }
}
