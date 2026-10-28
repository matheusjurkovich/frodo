import Testing

@testable import FrodoCore

@MainActor
private final class UnsubscribeBox {
    var unsubscribe: Unsubscribe = {}
}

@MainActor
@Suite("Event")
struct EventTests {
    @Test("entrega argumentos e permite cancelar")
    func deliversPayloadAndAllowsUnsubscribing() {
        let event = Event<Int>()
        var seen: [Int] = []
        let unsubscribe = event.on { seen.append($0) }
        event.emit(1)
        unsubscribe()
        event.emit(2)
        #expect(seen == [1])
    }

    @Test("remove todos os ouvintes")
    func removesAllListeners() {
        let event = Event<Int>()
        var seen: [Int] = []
        _ = event.on { seen.append($0) }
        event.clearListeners()
        event.emit(1)
        #expect(seen.isEmpty)
    }

    @Test("entrega na ordem em que os ouvintes assinaram")
    func deliversInSubscriptionOrder() {
        let event = Event<Void>()
        var order: [String] = []
        _ = event.on { order.append("a") }
        _ = event.on { order.append("b") }
        event.emit()
        #expect(order == ["a", "b"])
    }

    @Test("quem sai durante a emissão ainda recebe a emissão em curso")
    func unsubscribingDuringEmitStillDeliversCurrentEmission() {
        let event = Event<Void>()
        var seen: [String] = []
        let second = UnsubscribeBox()
        _ = event.on {
            seen.append("a")
            second.unsubscribe()
        }
        second.unsubscribe = event.on { seen.append("b") }
        event.emit()
        event.emit()
        #expect(seen == ["a", "b", "a"])
    }
}
