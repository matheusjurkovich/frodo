@MainActor
public protocol Destroyable: AnyObject {
    func destroy()
}

@MainActor
public final class Disposables {
    private var items: [@MainActor () -> Void] = []

    public init() {}

    public func add(_ dispose: @escaping @MainActor () -> Void) {
        items.append(dispose)
    }

    @discardableResult
    public func own<Item: Destroyable>(_ item: Item) -> Item {
        add { item.destroy() }
        return item
    }

    public func dispose() {
        let pending = items.reversed()
        items = []
        for dispose in pending {
            dispose()
        }
    }
}
