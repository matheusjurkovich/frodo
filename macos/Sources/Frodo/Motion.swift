import AppKit
import FrodoCore
import SwiftUI

enum Motion {
    static var reduced: Bool {
        NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    static func spring(_ spec: SpringSpec) -> Animation {
        .spring(response: Double.pi * spec.damping * (spec.milliseconds / 1000) / 2, dampingFraction: spec.damping)
    }

    static var standard: Animation { reduced ? .linear(duration: 0) : spring(.standard) }
    static var island: Animation { reduced ? .linear(duration: 0) : spring(.gentle) }
    static var soft: Animation { reduced ? .linear(duration: 0) : spring(.soft) }
    static var firm: Animation { reduced ? .linear(duration: 0) : spring(.firm) }
    static var hover: Animation { reduced ? .linear(duration: 0) : .easeOut(duration: 0.15) }
    static var fadeOut: Animation { reduced ? .linear(duration: 0) : .easeOut(duration: 0.11) }
    static var fadeIn: Animation { reduced ? .linear(duration: 0) : .easeOut(duration: 0.22).delay(0.07) }
    static var pillReturn: Animation {
        reduced ? .linear(duration: 0) : .easeOut(duration: 0.22).delay(max(0, SpringSpec.soft.milliseconds / 1000 - 0.22))
    }

    static var conceal: Animation { reduced ? .linear(duration: 0) : .easeIn(duration: SpringSpec.soft.milliseconds / 1000) }

    static func peekCountdown(seconds: Int) -> Animation {
        .linear(duration: Double(seconds))
    }

    static var reveal: Animation { reduced ? .linear(duration: 0) : .easeOut(duration: 0.24).delay(0.08) }

    static let slideDistance: CGFloat = 56
    static let openBlur: CGFloat = 16
    static let openScale: CGFloat = 0.9
    static let closeScale: CGFloat = 0.95
    static let pillEnterScale: CGFloat = 0.92
    static let pillExitScale: CGFloat = 0.96
    static let openDelay: TimeInterval = 0.15
    static let closeDelay: TimeInterval = 0.30
    static let autoCloseSeconds: TimeInterval = 5
}

typealias FrodoLevel = FrodoCore.Level
