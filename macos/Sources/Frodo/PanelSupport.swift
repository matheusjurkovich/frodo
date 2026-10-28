import AppKit
import SwiftUI

final class FrodoPanel: NSPanel {
    var allowsKey = false
    override var canBecomeKey: Bool { allowsKey }
    override var canBecomeMain: Bool { false }
}

final class ShapeHostingView<Content: View>: NSHostingView<Content> {
    var shapeSize: () -> CGSize = { .zero }
    var onPointer: () -> Void = {}
    private var region: NSTrackingArea?

    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = superview.map { convert(point, from: $0) } ?? point
        let size = shapeSize()
        let originX = (bounds.width - size.width) / 2
        let originY = isFlipped ? 0 : bounds.height - size.height
        let shape = NSRect(x: originX, y: originY, width: size.width, height: size.height)
        guard shape.contains(local) else { return nil }
        if let hit = super.hitTest(point), hit is NSTextField || hit is NSText { return hit }
        return self
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let region { removeTrackingArea(region) }
        let width: CGFloat = 640
        let rect = NSRect(x: (bounds.width - width) / 2, y: isFlipped ? 0 : bounds.height - 70, width: width, height: 70)
        let area = NSTrackingArea(rect: rect, options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways], owner: self, userInfo: nil)
        addTrackingArea(area)
        region = area
    }

    override func mouseEntered(with event: NSEvent) { onPointer() }
    override func mouseMoved(with event: NSEvent) { onPointer() }
}
