import AppKit
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
    static let island = Color(hex: 0x0A0A0B)
    static let islandBorder = Color.white.opacity(0.08)
    static let card = Color(hex: 0x17171A)
    static let cardInner = Color(hex: 0x1F1F23)
    static let control = Color(hex: 0x232327)
    static let controlHover = Color(hex: 0x26262B)
    static let track = Color(hex: 0x2A2A2F)
    static let divider = Color.white.opacity(0.06)
    static let accent = Color(nsColor: .controlAccentColor)
    static let accentText = Color(nsColor: .controlAccentColor).opacity(0.9)
    static let claude = Color(hex: 0xD97757)
    static let text = Color(hex: 0xF4F4F5)
    static let textSecondary = Color(hex: 0xA1A1AA)
    static let ok = Color(hex: 0x86EFAC)
    static let warn = Color(hex: 0xFBBF24)
    static let danger = Color(hex: 0xFCA5A5)
    static let dangerStrong = Color(hex: 0xEF4444)
    static let opus = Color(hex: 0xD97757)
    static let sonnet = Color(hex: 0xF4C7B5)
    static let haiku = Color(hex: 0xA8553A)
    static let amberBorder = Color(hex: 0xFBBF24, opacity: 0.55)

    enum Size {
        static let islandWidth: CGFloat = 900
        static let panelPadding: CGFloat = 50
        static let headerHeight: CGFloat = 44
        static let pillHeight: CGFloat = 40
        static let pillActionHeight: CGFloat = 48
        static let topMargin: CGFloat = 6
        static let maxIslandHeight: CGFloat = 760
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
}
