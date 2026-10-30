import AppKit
import SwiftUI

struct GlassBackground: View, Animatable {
    var radius: CGFloat

    var animatableData: CGFloat {
        get { radius }
        set { radius = newValue }
    }

    var body: some View {
        GlassEffect(radius: radius)
    }
}

private struct GlassEffect: NSViewRepresentable {
    let radius: CGFloat

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = Theme.glassMaterial
        view.blendingMode = .behindWindow
        view.state = .active
        view.appearance = NSAppearance(named: .darkAqua)
        view.maskImage = GlassMask.image(radius: radius)
        return view
    }

    func updateNSView(_ view: NSVisualEffectView, context: Context) {
        view.maskImage = GlassMask.image(radius: radius)
    }
}

@MainActor
private enum GlassMask {
    private static var cache: [Int: NSImage] = [:]

    static func image(radius: CGFloat) -> NSImage {
        let corner = max(1, min(64, Int(radius.rounded())))
        if let cached = cache[corner] { return cached }
        let cap = CGFloat(corner)
        let image = NSImage(size: NSSize(width: cap * 2 + 1, height: cap * 2 + 1), flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: cap, yRadius: cap).fill()
            return true
        }
        image.capInsets = NSEdgeInsets(top: cap, left: cap, bottom: cap, right: cap)
        image.resizingMode = .stretch
        cache[corner] = image
        return image
    }
}
