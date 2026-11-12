import Foundation
import FrodoCore

private let sampleSeconds: TimeInterval = 2
private let firstSampleSeconds: TimeInterval = 0.4
private let historySize = 60
private let topCount = 5

public struct ProcessUsage: Equatable, Sendable {
    public let pid: Int32
    public let name: String
    public let cpu: Double
    public let ramBytes: UInt64
    public let isProtected: Bool
}

public struct PerformanceSnapshot: Sendable {
    public let cpu: Double
    public let cores: Int
    public let memory: MemoryInfo?
    public let swap: (used: UInt64, total: UInt64)?
    public let gpu: Double?
    public let disk: (used: UInt64, total: UInt64)?
    public let diskRate: (read: Double, write: Double)?
}

private func perSecond(_ next: UInt64, _ previous: UInt64, _ seconds: Double) -> Double {
    next >= previous ? Double(next - previous) / seconds : 0
}

@MainActor
public final class PerformanceService: Destroyable {
    public let changed = Event<Void>()
    public private(set) var snapshot: PerformanceSnapshot?
    public private(set) var history: [Double] = []
    public private(set) var gpuHistory: [Double] = []
    public private(set) var processes: [ProcessUsage] = []

    private let probe: PerformanceProbe
    private let timer: TimerSlot
    private let ownUid: UInt32
    private let clock: () -> TimeInterval
    private var wanted = 0
    private var destroyed = false
    private var sampledAt: TimeInterval?
    private var previousCpu: CpuTimes?
    private var previousDisk: (read: UInt64, write: UInt64)?
    private var previousNanos: [Int32: UInt64] = [:]

    public init(
        probe: PerformanceProbe, scheduler: Scheduler, ownUid: UInt32 = getuid(),
        clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }
    ) {
        self.probe = probe
        timer = TimerSlot(scheduler: scheduler)
        self.ownUid = ownUid
        self.clock = clock
    }

    public func setWanted(_ isWanted: Bool) {
        if destroyed { return }
        let before = wanted
        wanted = max(0, before + (isWanted ? 1 : -1))
        if wanted == 0 {
            if before > 0 { halt() }
            return
        }
        if before > 0 { return }
        sample()
        timer.once(firstSampleSeconds) { [weak self] in
            self?.sample()
            self?.timer.every(sampleSeconds) { [weak self] in self?.sample() }
        }
    }

    public func top(sort: ProcessSort) -> [ProcessUsage] {
        topBy(processes, count: topCount) { sort == .cpu ? $0.cpu : Double($0.ramBytes) }
    }

    public func terminate(pid: Int32, name: String) -> Bool {
        guard pid > 0, let process = processes.first(where: { $0.pid == pid }), process.name == name, !process.isProtected else { return false }
        return kill(pid, SIGTERM) == 0
    }

    private func sample() {
        let now = clock()
        let elapsed = sampledAt.map { now - $0 } ?? 0
        sampledAt = now
        let cores = probe.cores()

        let times = probe.cpuTimes()
        var cpu = 0.0
        if let times, let previousCpu {
            cpu = cpuUsage(previousCpu, times)
            history = pushHistory(history, cpu, size: historySize)
        }
        previousCpu = times

        let gpu = probe.gpuBusy()
        if let gpu { gpuHistory = pushHistory(gpuHistory, gpu, size: historySize) }

        let bytes = probe.diskBytes()
        var diskRate: (read: Double, write: Double)?
        if let bytes {
            if let previousDisk, elapsed > 0 {
                diskRate = (perSecond(bytes.read, previousDisk.read, elapsed), perSecond(bytes.write, previousDisk.write, elapsed))
            } else {
                diskRate = (0, 0)
            }
        }
        previousDisk = bytes

        let samples = probe.processes()
        processes = samples.map { process in
            ProcessUsage(
                pid: process.pid, name: process.name,
                cpu: processCpu(previousNanos: previousNanos[process.pid], nanos: process.cpuNanos, elapsedSeconds: elapsed, cores: cores),
                ramBytes: process.residentBytes, isProtected: isProtected(name: process.name, uid: process.uid, ownUid: ownUid)
            )
        }
        previousNanos = Dictionary(samples.map { ($0.pid, $0.cpuNanos) }, uniquingKeysWith: { $1 })

        snapshot = PerformanceSnapshot(
            cpu: cpu, cores: cores, memory: probe.memory(), swap: probe.swap(), gpu: gpu, disk: probe.disk(), diskRate: diskRate
        )
        changed.emit()
    }

    private func halt() {
        timer.stop()
        sampledAt = nil
        previousCpu = nil
        previousDisk = nil
        previousNanos = [:]
        history = []
        gpuHistory = []
        processes = []
        snapshot = nil
    }

    public func destroy() {
        destroyed = true
        wanted = 0
        halt()
        changed.clearListeners()
    }
}
