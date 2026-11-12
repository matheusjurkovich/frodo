import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class RecordingScheduler: Scheduler {
    private var nextId = 0
    private var active: [Int: TimeInterval] = [:]

    var intervals: [TimeInterval] {
        active.keys.sorted().compactMap { active[$0] }
    }

    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = nextId
        nextId += 1
        active[id] = interval
        return { [weak self] in self?.active[id] = nil }
    }
}

@MainActor
@Suite("SystemState")
struct SystemStateTests {
    @Test("a memória é lida a cada 30 s para o alarme mesmo sem ninguém querer")
    func memoryAlarmPollsWithoutDemand() {
        let scheduler = RecordingScheduler()
        let state = SystemState(scheduler: scheduler)
        #expect(scheduler.intervals == [30])
        state.destroy()
        #expect(scheduler.intervals.isEmpty)
    }

    @Test("a memória segue sendo lida enquanto a pílula quer, mesmo que o cartão deixe de querer")
    func memoryKeepsRunningWhileAnyOwnerWants() {
        let scheduler = RecordingScheduler()
        let state = SystemState(scheduler: scheduler)
        defer { state.destroy() }
        state.setWantsMemory(true, by: .pill)
        state.setWantsMemory(true, by: .card)
        state.setWantsMemory(false, by: .card)
        #expect(scheduler.intervals == [5])
        #expect(state.memoryInfo != nil)
        state.setWantsMemory(false, by: .pill)
        #expect(scheduler.intervals == [30])
    }
}
