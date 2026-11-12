import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class StepScheduler: Scheduler {
    private var armed: [(id: Int, interval: TimeInterval, repeating: Bool, action: @MainActor () -> Void)] = []
    private var nextId = 0

    var intervals: [TimeInterval] {
        armed.map(\.interval)
    }

    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = nextId
        nextId += 1
        armed.append((id, interval, repeating, action))
        return { [weak self] in self?.armed.removeAll { $0.id == id } }
    }

    func fire(_ interval: TimeInterval) {
        guard let index = armed.firstIndex(where: { $0.interval == interval }) else {
            Issue.record("nenhum timer de \(interval) s armado")
            return
        }
        let entry = armed[index]
        if !entry.repeating { armed.remove(at: index) }
        entry.action()
    }
}

@MainActor
private final class FakeProbe: PerformanceProbe {
    var cpu: [CpuTimes] = []
    var samples: [[ProcessSample]] = []
    var bytes: [(read: UInt64, write: UInt64)] = []
    var gpu: Double?
    private(set) var reads = 0

    func cpuTimes() -> CpuTimes? {
        reads += 1
        return cpu.isEmpty ? nil : cpu.removeFirst()
    }

    func cores() -> Int { 4 }
    func memory() -> MemoryInfo? { MemoryInfo(totalBytes: 16, usedBytes: 8) }
    func swap() -> (used: UInt64, total: UInt64)? { nil }
    func gpuBusy() -> Double? { gpu }
    func disk() -> (used: UInt64, total: UInt64)? { (100, 500) }

    func diskBytes() -> (read: UInt64, write: UInt64)? {
        bytes.isEmpty ? nil : bytes.removeFirst()
    }

    func processes() -> [ProcessSample] {
        samples.isEmpty ? [] : samples.removeFirst()
    }
}

private func process(_ pid: Int32, _ name: String, nanos: UInt64, ram: UInt64 = 0, uid: UInt32 = 501) -> ProcessSample {
    ProcessSample(pid: pid, name: name, uid: uid, cpuNanos: nanos, residentBytes: ram)
}

private func doubles(_ values: Double...) -> [Double] {
    values
}

@MainActor
@Suite("PerformanceService")
struct PerformanceServiceTests {
    @Test("não lê o sistema enquanto a aba não quer")
    func doesNotReadWithoutDemand() {
        let probe = FakeProbe()
        let scheduler = StepScheduler()
        let service = PerformanceService(probe: probe, scheduler: scheduler, ownUid: 501)
        #expect(probe.reads == 0)
        #expect(scheduler.intervals.isEmpty)
        service.setWanted(true)
        service.setWanted(false)
        #expect(scheduler.intervals.isEmpty)
        #expect(service.snapshot == nil)
        service.destroy()
    }

    @Test("duas leituras dão a cpu pela diferença, a do processo e a taxa do disco")
    func twoReadsGiveDeltas() {
        let probe = FakeProbe()
        probe.cpu = [CpuTimes(busy: 150, total: 1000), CpuTimes(busy: 200, total: 1100)]
        probe.samples = [[process(10, "Safari", nanos: 1_000_000_000)], [process(10, "Safari", nanos: 3_000_000_000)]]
        probe.bytes = [(0, 0), (2_000, 4_000)]
        let scheduler = StepScheduler()
        var now: TimeInterval = 100
        let service = PerformanceService(probe: probe, scheduler: scheduler, ownUid: 501, clock: { now })
        defer { service.destroy() }
        service.setWanted(true)
        #expect(service.snapshot?.cpu == 0)
        #expect(service.history.isEmpty)
        now = 102
        scheduler.fire(0.4)
        #expect(abs((service.snapshot?.cpu ?? 0) - 0.5) < 1e-9)
        #expect(service.history == doubles(0.5))
        #expect(abs((service.processes.first?.cpu ?? 0) - 0.25) < 1e-9)
        #expect(service.snapshot?.diskRate?.read == 1_000)
        #expect(service.snapshot?.diskRate?.write == 2_000)
        #expect(scheduler.intervals == [2])
    }

    @Test("continua lendo enquanto alguém quer")
    func keepsReadingWhileAnyoneWants() {
        let probe = FakeProbe()
        let scheduler = StepScheduler()
        let service = PerformanceService(probe: probe, scheduler: scheduler, ownUid: 501)
        defer { service.destroy() }
        service.setWanted(true)
        service.setWanted(true)
        service.setWanted(false)
        #expect(scheduler.intervals == [0.4])
        #expect(service.snapshot != nil)
        service.setWanted(false)
        #expect(scheduler.intervals.isEmpty)
    }

    @Test("o topo ordena por cpu ou por ram")
    func topSortsByCpuOrRam() {
        let probe = FakeProbe()
        probe.samples = [
            [process(1, "a", nanos: 0, ram: 300), process(2, "b", nanos: 0, ram: 100)],
            [process(1, "a", nanos: 0, ram: 300), process(2, "b", nanos: 1_000_000_000, ram: 100)],
        ]
        let scheduler = StepScheduler()
        var now: TimeInterval = 0
        let service = PerformanceService(probe: probe, scheduler: scheduler, ownUid: 501, clock: { now })
        defer { service.destroy() }
        service.setWanted(true)
        now = 1
        scheduler.fire(0.4)
        #expect(service.top(sort: .cpu).map(\.pid) == [2, 1])
        #expect(service.top(sort: .ram).map(\.pid) == [1, 2])
    }

    @Test("não encerra processo protegido, desconhecido ou pid inválido")
    func refusesToTerminateProtected() {
        let probe = FakeProbe()
        probe.samples = [[process(1, "launchd", nanos: 0), process(77, "Safari", nanos: 0, uid: 0)]]
        let service = PerformanceService(probe: probe, scheduler: StepScheduler(), ownUid: 501)
        defer { service.destroy() }
        service.setWanted(true)
        #expect(service.processes.map(\.isProtected) == [true, true])
        #expect(!service.terminate(pid: 1))
        #expect(!service.terminate(pid: 77))
        #expect(!service.terminate(pid: 0))
        #expect(!service.terminate(pid: -1))
        #expect(!service.terminate(pid: 999_999))
    }
}
