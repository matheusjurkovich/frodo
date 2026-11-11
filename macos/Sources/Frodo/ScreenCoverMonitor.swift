import AppKit
import FrodoCore

@MainActor
final class ScreenCoverMonitor: Destroyable {
    let changed = Event<Void>()
    private(set) var windows: [CGRect] = []

    private let timer: TimerSlot
    private var spaceObserver: NSObjectProtocol?

    init(scheduler: Scheduler) {
        timer = TimerSlot(scheduler: scheduler)
        windows = Self.otherAppWindows()
        timer.every(Motion.coverRefresh) { [weak self] in self?.refresh() }
        spaceObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        }
    }

    func cover(of screen: NSScreen) -> ScreenCover {
        guard let primary = NSScreen.screens.first else { return .none }
        return screenCover(
            windows: windows,
            screen: Self.globalFrame(screen.frame, primary: primary),
            visible: Self.globalFrame(screen.visibleFrame, primary: primary)
        )
    }

    private func refresh() {
        let next = Self.otherAppWindows()
        guard next != windows else { return }
        windows = next
        changed.emit()
    }

    private static func otherAppWindows() -> [CGRect] {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else { return [] }
        let ownPid = Int(ProcessInfo.processInfo.processIdentifier)
        return list.compactMap { window -> CGRect? in
            guard (window[kCGWindowLayer as String] as? Int) == 0, (window[kCGWindowOwnerPID as String] as? Int) != ownPid,
                (window[kCGWindowAlpha as String] as? Double ?? 1) > 0.01,
                let bounds = window[kCGWindowBounds as String] as? [String: CGFloat]
            else { return nil }
            return CGRect(dictionaryRepresentation: bounds as CFDictionary)
        }
    }

    private static func globalFrame(_ frame: CGRect, primary: NSScreen) -> CGRect {
        CGRect(x: frame.minX, y: primary.frame.height - frame.maxY, width: frame.width, height: frame.height)
    }

    func destroy() {
        timer.stop()
        if let spaceObserver { NSWorkspace.shared.notificationCenter.removeObserver(spaceObserver) }
        spaceObserver = nil
        changed.clearListeners()
    }
}
