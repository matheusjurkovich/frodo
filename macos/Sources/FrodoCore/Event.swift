public typealias Unsubscribe = @MainActor () -> Void

@MainActor
public final class Event<Payload> {
    private var listeners: [(id: Int, handler: @MainActor (Payload) -> Void)] = []
    private var nextId = 0

    public init() {}

    public func on(_ handler: @escaping @MainActor (Payload) -> Void) -> Unsubscribe {
        let id = nextId
        nextId += 1
        listeners.append((id, handler))
        return { [weak self] in
            self?.listeners.removeAll { $0.id == id }
        }
    }

    public func emit(_ payload: Payload) {
        for listener in listeners {
            listener.handler(payload)
        }
    }

    public func clearListeners() {
        listeners = []
    }
}

extension Event where Payload == Void {
    public func emit() {
        emit(())
    }
}
