import Testing

@testable import FrodoCore

@MainActor
private final class Recorder: Destroyable {
    private let name: String
    private let log: (String) -> Void

    init(name: String, log: @escaping (String) -> Void) {
        self.name = name
        self.log = log
    }

    func destroy() {
        log(name)
    }
}

@MainActor
@Suite("Disposables")
struct DisposablesTests {
    @Test("desfaz em ordem reversa e só uma vez")
    func disposesInReverseOrderOnlyOnce() {
        let bag = Disposables()
        var order: [String] = []
        bag.add { order.append("a") }
        bag.add { order.append("b") }
        bag.dispose()
        bag.dispose()
        #expect(order == ["b", "a"])
    }

    @Test("cancela assinaturas de eventos")
    func cancelsEventSubscriptions() {
        let bag = Disposables()
        let event = Event<Int>()
        var seen: [Int] = []
        bag.add(event.on { seen.append($0) })
        event.emit(1)
        bag.dispose()
        event.emit(2)
        #expect(seen == [1])
    }

    @Test("own devolve o item e o destrói no dispose, em ordem inversa")
    func ownReturnsItemAndDestroysItInReverseOrder() {
        var calls: [String] = []
        let bag = Disposables()
        let item = Recorder(name: "item") { calls.append($0) }
        #expect(bag.own(item) === item)
        bag.add { calls.append("add") }
        bag.dispose()
        #expect(calls == ["add", "item"])
    }
}
