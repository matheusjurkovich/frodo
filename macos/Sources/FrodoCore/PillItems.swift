import Foundation

public func reordered<Element: Equatable>(_ items: [Element], moving item: Element, to index: Int) -> [Element] {
    guard items.contains(item) else { return items }
    var next = items.filter { $0 != item }
    next.insert(item, at: min(next.count, max(0, index)))
    return next
}

public func movingItem(_ items: [ClosedItem], _ item: ClosedItem, by offset: Int) -> [ClosedItem] {
    guard let index = items.firstIndex(of: item) else { return items }
    let target = index + offset
    guard items.indices.contains(target) else { return items }
    return reordered(items, moving: item, to: target)
}

public func removingItem(_ items: [ClosedItem], _ item: ClosedItem) -> [ClosedItem] {
    guard items.count > 1 else { return items }
    return items.filter { $0 != item }
}

public func addingItem(_ items: [ClosedItem], _ item: ClosedItem) -> [ClosedItem] {
    items.contains(item) ? items : items + [item]
}

public func missingItems(_ items: [ClosedItem]) -> [ClosedItem] {
    ClosedItem.allCases.filter { !items.contains($0) }
}

public func visibleItems(mode: ClosedMode, items: [ClosedItem]) -> [ClosedItem] {
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

public func rotatingItem(_ items: [ClosedItem], now: Date, everySeconds: Int) -> ClosedItem? {
    let texts = items.filter(\.isText)
    guard !texts.isEmpty else { return nil }
    let slot = Int(now.timeIntervalSince1970) / max(1, everySeconds)
    return texts[(slot % texts.count + texts.count) % texts.count]
}
