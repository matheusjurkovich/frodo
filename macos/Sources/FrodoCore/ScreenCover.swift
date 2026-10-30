import CoreGraphics

public enum ScreenCover: Equatable, Sendable {
    case none
    case maximized
    case fullscreen
}

public enum PillPresence: Equatable, Sendable {
    case pill
    case tongue
    case hidden
}

public func screenCover(windows: [CGRect], screen: CGRect, visible: CGRect, tolerance: CGFloat = 4) -> ScreenCover {
    if windows.contains(where: { covers($0, area: screen, tolerance: tolerance) }) { return .fullscreen }
    if windows.contains(where: { covers($0, area: visible, tolerance: tolerance) }) { return .maximized }
    return .none
}

private func covers(_ window: CGRect, area: CGRect, tolerance: CGFloat) -> Bool {
    window.minX <= area.minX + tolerance && window.minY <= area.minY + tolerance
        && window.maxX >= area.maxX - tolerance && window.maxY >= area.maxY - tolerance
}

public func pillCovered(_ cover: ScreenCover, alwaysShow: Bool) -> Bool {
    cover == .fullscreen || (cover == .maximized && !alwaysShow)
}

public func pillPresence(cover: ScreenCover, alwaysShow: Bool, activity: ActivityKind?, peeking: Bool) -> PillPresence {
    guard pillCovered(cover, alwaysShow: alwaysShow) else { return .pill }
    if peeking || breaksThroughCover(activity, fullscreen: cover == .fullscreen) { return .pill }
    return cover == .fullscreen ? .hidden : .tongue
}

private func breaksThroughCover(_ activity: ActivityKind?, fullscreen: Bool) -> Bool {
    switch activity {
    case .claudePermission, .claudeWaiting: true
    case .notification: !fullscreen
    default: false
    }
}
