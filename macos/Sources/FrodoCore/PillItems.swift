import CoreGraphics
import Foundation

public func moveTo<Element: Equatable>(_ items: [Element], _ item: Element, _ index: Int) -> [Element] {
    guard items.contains(item) else { return items }
    var next = items.filter { $0 != item }
    next.insert(item, at: min(next.count, max(0, index)))
    return next
}

public func movingItem<Element: Equatable>(_ items: [Element], _ item: Element, by offset: Int) -> [Element] {
    guard let index = items.firstIndex(of: item) else { return items }
    let target = index + offset
    guard items.indices.contains(target) else { return items }
    return moveTo(items, item, target)
}

public func insertionIndex(_ frames: [CGRect], at point: CGPoint, horizontal: Bool) -> Int? {
    var best: (index: Int, distance: CGFloat)?
    for (index, frame) in frames.enumerated() {
        if horizontal, point.y < frame.minY || point.y > frame.maxY { continue }
        let start = horizontal ? frame.minX : frame.minY
        let end = horizontal ? frame.maxX : frame.maxY
        let position = horizontal ? point.x : point.y
        let distance = max(0, start - position, position - end)
        if let best, distance >= best.distance { continue }
        best = (position > (start + end) / 2 ? index + 1 : index, distance)
    }
    return best?.index
}

public func removingItem(_ items: [ClosedItem], _ item: ClosedItem) -> [ClosedItem] {
    guard items.count > 1 else { return items }
    return items.filter { $0 != item }
}

public func addingItem(_ items: [ClosedItem], _ item: ClosedItem) -> [ClosedItem] {
    items.contains(item) ? items : items + [item]
}

public struct RotationState {
    public let hasBattery: Bool
    public let providerEnabled: (AiProvider) -> Bool

    public init(hasBattery: Bool, providerEnabled: @escaping (AiProvider) -> Bool) {
        self.hasBattery = hasBattery
        self.providerEnabled = providerEnabled
    }
}

private func shown(_ item: ClosedItem, _ providerEnabled: (AiProvider) -> Bool) -> Bool {
    guard let provider = item.provider, provider != .claude else { return true }
    return providerEnabled(provider)
}

public func missingItems(_ items: [ClosedItem], providerEnabled: (AiProvider) -> Bool = { _ in true }) -> [ClosedItem] {
    ClosedItem.allCases.filter { !items.contains($0) && $0.provider.map(providerEnabled) ?? true }
}

public func visibleItems(mode: ClosedMode, items: [ClosedItem], providerEnabled: (AiProvider) -> Bool = { _ in true }) -> [ClosedItem] {
    let items = items.filter { shown($0, providerEnabled) }
    switch mode {
    case .minimal:
        return [.clock]
    case .compact:
        return items
    case .rotating:
        let firstText = items.firstIndex(where: \.isText)
        return items.enumerated().filter { !$0.element.isText || $0.offset == firstText }.map(\.element)
    }
}

public func rotatingItems(_ items: [ClosedItem], _ state: RotationState) -> [ClosedItem] {
    items.filter { $0.isText && ($0 != .battery || state.hasBattery) && shown($0, state.providerEnabled) }
}

public func rotatingItem(_ items: [ClosedItem], now: Date, everySeconds: Int, state: RotationState) -> ClosedItem? {
    let texts = rotatingItems(items, state)
    guard !texts.isEmpty else { return nil }
    let slot = Int(now.timeIntervalSince1970) / max(1, everySeconds)
    return texts[(slot % texts.count + texts.count) % texts.count]
}
