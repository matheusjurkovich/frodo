public enum TabId: String, CaseIterable, Sendable {
    case general
    case calendar
    case claude
    case notifications

    public var label: String {
        switch self {
        case .general: "Geral"
        case .calendar: "Calendário"
        case .claude: "Claude"
        case .notifications: "Notificações"
        }
    }
}

public func visibleTabs(hidden: [TabId]) -> [TabId] {
    let shown = TabId.allCases.filter { !hidden.contains($0) }
    return shown.isEmpty ? [TabId.general] : shown
}

public func tabToOpen(_ requested: TabId, visible: [TabId]) -> TabId {
    visible.contains(requested) ? requested : (visible.first ?? .general)
}
