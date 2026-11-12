import AppKit
import FrodoCore
import SwiftUI

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: opacity)
    }

    init(hexString: String) {
        let cleaned = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        self.init(hex: UInt32(cleaned, radix: 16) ?? 0x808080)
    }
}

enum Theme {
    @MainActor
    private static func byStyle(_ solid: Color, frosted: Color? = nil, clear: Color) -> Color {
        switch Surface.shared.style {
        case .solid: solid
        case .frosted: frosted ?? solid
        case .clear: clear
        }
    }

    @MainActor
    static var island: Color {
        byStyle(Color(hex: 0x0A0A0B), frosted: Color(hex: 0x0A0A0B, opacity: 0.72), clear: Color(hex: 0x0A0A0B, opacity: 0.42))
    }

    @MainActor
    static var shadowStrength: Double {
        switch Surface.shared.style {
        case .solid: 1
        case .frosted: 0.72
        case .clear: 0.42
        }
    }

    static let glassMaterial: NSVisualEffectView.Material = .underWindowBackground

    static let islandBorder = Color.white.opacity(0.08)
    @MainActor static var card: Color { byStyle(Color(hex: 0x17171A), clear: Color(hex: 0x17171A, opacity: 0.25)) }
    @MainActor static var cardInner: Color { byStyle(Color(hex: 0x1F1F23), clear: Color(hex: 0x17171A, opacity: 0.25)) }
    @MainActor static var control: Color { byStyle(Color(hex: 0x232327), clear: Color(hex: 0x1F1F23, opacity: 0.45)) }
    @MainActor static var controlHover: Color { byStyle(Color(hex: 0x26262B), clear: Color.white.opacity(0.08)) }
    @MainActor static var track: Color { byStyle(Color(hex: 0x2A2A2F), clear: Color.white.opacity(0.14)) }
    static let divider = Color.white.opacity(0.06)
    static let accent = Color(nsColor: .controlAccentColor)
    static let accentText = Color(nsColor: .controlAccentColor).opacity(0.9)
    static let claude = Color(hex: 0xD97757)
    static let codex = Color(hex: 0x3DBE9C)
    static let gemini = Color(hex: 0x8AB4F8)
    static let text = Color(hex: 0xF4F4F5)
    static let textSecondary = Color(hex: 0xA1A1AA)
    static let ok = Color(hex: 0x86EFAC)
    static let warn = Color(hex: 0xFBBF24)
    static let danger = Color(hex: 0xFCA5A5)
    static let dangerStrong = Color(hex: 0xEF4444)
    static let opus = Color(hex: 0xD97757)
    static let sonnet = Color(hex: 0xF4C7B5)
    static let haiku = Color(hex: 0xA8553A)
    static let codexGpt = Color(hex: 0x3DBE9C)
    static let codexCodex = Color(hex: 0xA7E8D6)
    static let codexMini = Color(hex: 0x1F8A6E)
    static let geminiPro = Color(hex: 0x8AB4F8)
    static let geminiFlash = Color(hex: 0x4A7FD8)
    static let otherModel = Color(hex: 0x71717A)
    static let taskFill = Color(hex: 0xE4E4E7)
    static let amberBorder = Color(hex: 0xFBBF24, opacity: 0.55)

    enum Size {
        static let islandWidth: CGFloat = 900
        static let panelPadding: CGFloat = 50
        static let headerHeight: CGFloat = 44
        static let pillHeight: CGFloat = 40
        static let pillActionHeight: CGFloat = 48
        static let topMargin: CGFloat = 6
        static let maxIslandHeight: CGFloat = 760
        static let ringBase: CGFloat = 16
        static let ringLine: CGFloat = 3
    }

    enum Radius {
        static let panel: CGFloat = 28
        static let card: CGFloat = 18
        static let item: CGFloat = 12
        static let pill: CGFloat = 999
    }

    enum Font {
        static func label(_ weight: SwiftUI.Font.Weight = .regular) -> SwiftUI.Font { .system(size: 12, weight: weight) }
        static func secondary(_ weight: SwiftUI.Font.Weight = .regular) -> SwiftUI.Font { .system(size: 13, weight: weight) }
        static func body(_ weight: SwiftUI.Font.Weight = .regular) -> SwiftUI.Font { .system(size: 14, weight: weight) }
        static func title(_ weight: SwiftUI.Font.Weight = .medium) -> SwiftUI.Font { .system(size: 15, weight: weight) }
        static func number(_ weight: SwiftUI.Font.Weight = .medium) -> SwiftUI.Font { .system(size: 16, weight: weight, design: .rounded) }
        static func mono(_ size: CGFloat = 13) -> SwiftUI.Font { .system(size: size, design: .monospaced) }
    }

    static func color(for level: FrodoLevel) -> Color {
        switch level {
        case .ok: claude
        case .warn: warn
        case .crit: dangerStrong
        }
    }

    static func color(for provider: AiProvider) -> Color {
        switch provider {
        case .claude: claude
        case .codex: codex
        case .gemini: gemini
        }
    }

    static func color(for provider: AiProvider, level: FrodoLevel) -> Color {
        level == .ok ? color(for: provider) : color(for: level)
    }

    @MainActor
    static func color(forBar bar: Bar, provider: AiProvider) -> Color {
        if bar.future { return track }
        return bar.current ? color(for: provider) : color(for: provider).opacity(0.5)
    }

    static func color(for status: SessionStatus) -> Color {
        switch status {
        case .working: claude
        case .waiting: warn
        case .done: ok
        case .idle: textSecondary
        }
    }

    static func color(forModel family: String) -> Color {
        switch family {
        case "Opus": opus
        case "Sonnet": sonnet
        case "Haiku": haiku
        case "codex-gpt": codexGpt
        case "codex-codex": codexCodex
        case "codex-mini": codexMini
        case "gemini-pro": geminiPro
        case "gemini-flash": geminiFlash
        default: otherModel
        }
    }

    enum Snapshot {
        static let backdrop = Color(white: 0.32)
        static let iconTop = Color(hex: 0x1F1F23)
        static let iconBottom = Color(hex: 0x0A0A0B)
        static let iconPill = Color(hex: 0x000000)
        static let iconIsland = Color(hex: 0x17171A)
        static let stripes = [Color(hex: 0xE5484D), Color(hex: 0x3E63DD), Color(hex: 0xF5D90A), Color(hex: 0x30A46C)]
    }
}
