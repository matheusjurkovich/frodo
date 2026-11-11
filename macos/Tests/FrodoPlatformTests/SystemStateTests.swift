import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class CountingScheduler: Scheduler {
    private(set) var armed = 0

    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe {
        armed += 1
        return { [weak self] in self?.armed -= 1 }
    }
}

@MainActor
@Suite("SystemState")
struct SystemStateTests {
    @Test("a memória segue sendo lida enquanto a pílula quer, mesmo que o cartão deixe de querer")
    func memoryKeepsRunningWhileAnyOwnerWants() {
        let scheduler = CountingScheduler()
        let state = SystemState(scheduler: scheduler)
        defer { state.destroy() }
        state.setWantsMemory(true, by: .pill)
        state.setWantsMemory(true, by: .card)
        state.setWantsMemory(false, by: .card)
        #expect(scheduler.armed == 1)
        #expect(state.memoryInfo != nil)
        state.setWantsMemory(false, by: .pill)
        #expect(scheduler.armed == 0)
    }
}
