public enum AiProvider: String, CaseIterable, Sendable {
    case claude
    case codex
    case gemini

    public var name: String {
        switch self {
        case .claude: "Claude"
        case .codex: "Codex"
        case .gemini: "Gemini"
        }
    }
}

public enum PillAiActivity: String, CaseIterable, Sendable {
    case always
    case change
    case never

    public var label: String {
        switch self {
        case .always: "Sempre"
        case .change: "Ao mudar"
        case .never: "Nunca"
        }
    }
}
