import CoreGraphics

public enum HorizontalAnchor: Sendable {
    case leading
    case center
    case trailing
}

public enum VerticalAnchor: Sendable {
    case top
    case middle
    case bottom
}

public enum IslandPosition: String, CaseIterable, Sendable {
    case topLeft
    case topCenter
    case topRight
    case middleLeft
    case middleRight
    case bottomLeft
    case bottomCenter
    case bottomRight

    public var horizontal: HorizontalAnchor {
        switch self {
        case .topLeft, .middleLeft, .bottomLeft: .leading
        case .topCenter, .bottomCenter: .center
        case .topRight, .middleRight, .bottomRight: .trailing
        }
    }

    public var vertical: VerticalAnchor {
        switch self {
        case .topLeft, .topCenter, .topRight: .top
        case .middleLeft, .middleRight: .middle
        case .bottomLeft, .bottomCenter, .bottomRight: .bottom
        }
    }

    public var isSideEdge: Bool {
        vertical == .middle
    }

    public var label: String {
        switch self {
        case .topLeft: "Em cima, à esquerda"
        case .topCenter: "Em cima, no meio"
        case .topRight: "Em cima, à direita"
        case .middleLeft: "No meio, à esquerda"
        case .middleRight: "No meio, à direita"
        case .bottomLeft: "Embaixo, à esquerda"
        case .bottomCenter: "Embaixo, no meio"
        case .bottomRight: "Embaixo, à direita"
        }
    }
}

public func islandPanelFrame(position: IslandPosition, visible: CGRect, islandSize: CGSize, padding: CGFloat, margin: CGFloat) -> CGRect {
    let width = islandSize.width + (position.horizontal == .center ? 2 * padding : padding)
    let height = islandSize.height + (position.vertical == .middle ? 2 * padding : padding)
    let originX: CGFloat
    switch position.horizontal {
    case .leading: originX = visible.minX + margin
    case .center: originX = visible.midX - width / 2
    case .trailing: originX = visible.maxX - margin - width
    }
    let originY: CGFloat
    switch position.vertical {
    case .top: originY = visible.maxY - margin - height
    case .middle: originY = visible.midY - height / 2
    case .bottom: originY = visible.minY + margin
    }
    return CGRect(x: originX, y: originY, width: width, height: height)
}

public func islandShapeRect(position: IslandPosition, panel: CGRect, size: CGSize) -> CGRect {
    let originX: CGFloat
    switch position.horizontal {
    case .leading: originX = panel.minX
    case .center: originX = panel.midX - size.width / 2
    case .trailing: originX = panel.maxX - size.width
    }
    let originY: CGFloat
    switch position.vertical {
    case .top: originY = panel.maxY - size.height
    case .middle: originY = panel.midY - size.height / 2
    case .bottom: originY = panel.minY
    }
    return CGRect(x: originX, y: originY, width: size.width, height: size.height)
}
