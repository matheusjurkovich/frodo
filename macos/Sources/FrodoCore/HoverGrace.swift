import CoreGraphics

public struct HoverGrace: Sendable {
    public static let defaultTolerance: CGFloat = 4

    private let tolerance: CGFloat
    private var lastShape: CGRect?
    private var restPoint: CGPoint?

    public init(tolerance: CGFloat = HoverGrace.defaultTolerance) {
        self.tolerance = tolerance
    }

    public mutating func isOverIsland(pointer: CGPoint, shape: CGRect) -> Bool {
        let inside = shape.contains(pointer)
        if let lastShape, lastShape != shape, lastShape.contains(pointer), !inside {
            restPoint = pointer
        }
        lastShape = shape
        if let rest = restPoint, inside || hypot(pointer.x - rest.x, pointer.y - rest.y) > tolerance {
            restPoint = nil
        }
        return inside || restPoint != nil
    }

    public mutating func reset() {
        lastShape = nil
        restPoint = nil
    }
}
