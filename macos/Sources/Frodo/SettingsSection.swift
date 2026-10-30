enum SettingsSection: String, CaseIterable, Identifiable {
    case general
    case display
    case pill
    case tabs
    case ai
    case agenda

    var id: String { rawValue }

    var label: String {
        switch self {
        case .general: "Geral"
        case .display: "Tela e posição"
        case .pill: "Pílula"
        case .tabs: "Abas"
        case .ai: "IA"
        case .agenda: "Agenda"
        }
    }

    var icon: (name: String, system: String?) {
        switch self {
        case .general: ("general", nil)
        case .display: ("display", "display")
        case .pill: ("pill", "capsule")
        case .tabs: ("workspaces", nil)
        case .ai: ("claude", nil)
        case .agenda: ("calendar", nil)
        }
    }
}
