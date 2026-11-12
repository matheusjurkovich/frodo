public enum TabId: String, CaseIterable, Sendable {
    case general
    case calendar
    case claude
    case notifications
    case performance
    case mixer

    public var label: String {
        switch self {
        case .general: "Geral"
        case .calendar: "Calendário"
        case .claude: "IA"
        case .notifications: "Notificações"
        case .performance: "Desempenho"
        case .mixer: "Mixer de volume"
        }
    }
}

public func orderedTabs(_ order: [String]) -> [TabId] {
    var known: [TabId] = []
    for id in order.compactMap({ TabId(rawValue: $0) }) where !known.contains(id) {
        known.append(id)
    }
    return known + TabId.allCases.filter { !known.contains($0) }
}

public func visibleTabs(hidden: [TabId], order: [TabId] = TabId.allCases) -> [TabId] {
    let shown = order.filter { !hidden.contains($0) }
    return shown.isEmpty ? [order.first ?? TabId.general] : shown
}

public func tabToOpen(_ requested: TabId, visible: [TabId]) -> TabId {
    visible.contains(requested) ? requested : (visible.first ?? .general)
}
