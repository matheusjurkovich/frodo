import AppKit
import FrodoCore
import SwiftUI

final class FrodoPanel: NSPanel {
    var allowsKey = false
    override var canBecomeKey: Bool { allowsKey }
    override var canBecomeMain: Bool { false }
}

final class ShapeHostingView<Content: View>: NSHostingView<Content> {
    var shapeSize: () -> CGSize = { .zero }
    var position: () -> IslandPosition = { .topCenter }
    var onPointer: () -> Void = {}
    private var trackingRegion: NSTrackingArea?

    private func anchoredRect(size: CGSize) -> CGRect {
        let rect = islandShapeRect(position: position(), panel: CGRect(origin: .zero, size: bounds.size), size: size)
        return isFlipped ? CGRect(x: rect.minX, y: bounds.height - rect.maxY, width: rect.width, height: rect.height) : rect
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = superview.map { convert(point, from: $0) } ?? point
        guard anchoredRect(size: shapeSize()).contains(local) else { return nil }
        if let hit = super.hitTest(point), hit is NSTextField || hit is NSText { return hit }
        return self
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let area = trackingRegion { removeTrackingArea(area) }
        let region = islandHoverRegion(position: position())
        let area = NSTrackingArea(
            rect: anchoredRect(size: CGSize(width: min(region.width, bounds.width), height: min(region.height, bounds.height))),
            options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways], owner: self, userInfo: nil
        )
        addTrackingArea(area)
        trackingRegion = area
    }

    override func mouseEntered(with event: NSEvent) { onPointer() }
    override func mouseMoved(with event: NSEvent) { onPointer() }
}
