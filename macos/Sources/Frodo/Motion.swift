import AppKit
import FrodoCore
import SwiftUI

enum Motion {
    @MainActor
    static var reduced: Bool {
        NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    static func spring(_ spec: SpringSpec) -> Animation {
        .spring(response: Double.pi * spec.damping * (spec.milliseconds / 1000) / 2, dampingFraction: spec.damping)
    }

    @MainActor static var standard: Animation { reduced ? .linear(duration: 0) : spring(.standard) }
    @MainActor static var island: Animation { reduced ? .linear(duration: 0) : spring(.gentle) }
    @MainActor static var soft: Animation { reduced ? .linear(duration: 0) : spring(.soft) }
    @MainActor static var hover: Animation { reduced ? .linear(duration: 0) : .easeOut(duration: 0.15) }
    @MainActor static var fadeOut: Animation { reduced ? .linear(duration: 0) : .easeOut(duration: 0.11) }
    @MainActor static var swapFade: Animation { reduced ? .linear(duration: 0) : .easeOut(duration: 0.22) }
    @MainActor static var fadeIn: Animation { reduced ? .linear(duration: 0) : .easeOut(duration: 0.22).delay(0.07) }
    @MainActor static var pillReturn: Animation {
        reduced ? .linear(duration: 0) : .easeOut(duration: 0.22).delay(max(0, SpringSpec.soft.milliseconds / 1000 - 0.22))
    }

    @MainActor static var conceal: Animation { reduced ? .linear(duration: 0) : .easeIn(duration: SpringSpec.soft.milliseconds / 1000) }

    static func peekCountdown(seconds: Int) -> Animation {
        .linear(duration: Double(seconds))
    }

    static let swapOffset: CGFloat = 56
    static let openBlur: CGFloat = 16
    static let openScale: CGFloat = 0.9
    static let pillEnterScale: CGFloat = 0.92
    static let pillExitScale: CGFloat = 0.96
    static let openDelay: TimeInterval = 0.15
    static let closeDelay: TimeInterval = 0.30
    static let autoCloseSeconds: TimeInterval = 5
    static let hoverPoll: TimeInterval = 0.05
    static let coverRefresh: TimeInterval = 1
    static let quitFlushTimeout: TimeInterval = 2
}

typealias FrodoLevel = FrodoCore.Level
