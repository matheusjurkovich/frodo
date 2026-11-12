import Foundation
import FrodoCore
import IOKit

public struct ProcessSample: Equatable, Sendable {
    public let pid: Int32
    public let name: String
    public let uid: UInt32
    public let cpuNanos: UInt64
    public let residentBytes: UInt64

    public init(pid: Int32, name: String, uid: UInt32, cpuNanos: UInt64, residentBytes: UInt64) {
        self.pid = pid
        self.name = name
        self.uid = uid
        self.cpuNanos = cpuNanos
        self.residentBytes = residentBytes
    }
}

@MainActor
public protocol PerformanceProbe {
    func cpuTimes() -> CpuTimes?
    func cores() -> Int
    func memory() -> MemoryInfo?
    func swap() -> (used: UInt64, total: UInt64)?
    func gpuBusy() -> Double?
    func disk() -> (used: UInt64, total: UInt64)?
    func diskBytes() -> (read: UInt64, write: UInt64)?
    func processes() -> [ProcessSample]
}

private func registryProperties(of className: String, key: String) -> [NSDictionary] {
    var iterator: io_iterator_t = 0
    guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching(className), &iterator) == KERN_SUCCESS else { return [] }
    defer { IOObjectRelease(iterator) }
    var found: [NSDictionary] = []
    var entry = IOIteratorNext(iterator)
    while entry != 0 {
        if let value = IORegistryEntryCreateCFProperty(entry, key as CFString, nil, 0)?.takeRetainedValue() as? NSDictionary {
            found.append(value)
        }
        IOObjectRelease(entry)
        entry = IOIteratorNext(iterator)
    }
    return found
}

private func number(_ dictionary: NSDictionary, _ key: String) -> NSNumber? {
    dictionary[key] as? NSNumber
}

@MainActor
public struct MachPerformanceProbe: PerformanceProbe {
    private let timebaseNumer: Double
    private let timebaseDenom: Double

    public init() {
        var timebase = mach_timebase_info_data_t()
        mach_timebase_info(&timebase)
        timebaseNumer = Double(timebase.numer)
        timebaseDenom = Double(max(1, timebase.denom))
    }

    public func cpuTimes() -> CpuTimes? {
        var load = host_cpu_load_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &load) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count) }
        }
        guard result == KERN_SUCCESS else { return nil }
        let user = UInt64(load.cpu_ticks.0)
        let system = UInt64(load.cpu_ticks.1)
        let idle = UInt64(load.cpu_ticks.2)
        let nice = UInt64(load.cpu_ticks.3)
        return CpuTimes(busy: user + system + nice, total: user + system + nice + idle)
    }

    public func cores() -> Int {
        ProcessInfo.processInfo.activeProcessorCount
    }

    public func memory() -> MemoryInfo? {
        readMemoryInfo()
    }

    public func swap() -> (used: UInt64, total: UInt64)? {
        var usage = xsw_usage()
        var size = MemoryLayout<xsw_usage>.size
        guard sysctlbyname("vm.swapusage", &usage, &size, nil, 0) == 0 else { return nil }
        return (usage.xsu_used, usage.xsu_total)
    }

    public func gpuBusy() -> Double? {
        let values = registryProperties(of: "IOAccelerator", key: "PerformanceStatistics").compactMap { number($0, "Device Utilization %")?.doubleValue }
        guard let busiest = values.max() else { return nil }
        return min(1, max(0, busiest / 100))
    }

    public func disk() -> (used: UInt64, total: UInt64)? {
        let keys: Set<URLResourceKey> = [.volumeTotalCapacityKey, .volumeAvailableCapacityKey]
        guard let values = try? URL(fileURLWithPath: "/").resourceValues(forKeys: keys), let total = values.volumeTotalCapacity,
            let available = values.volumeAvailableCapacity, total > 0
        else { return nil }
        return (UInt64(max(0, total - available)), UInt64(total))
    }

    public func diskBytes() -> (read: UInt64, write: UInt64)? {
        let statistics = registryProperties(of: "IOBlockStorageDriver", key: "Statistics")
        guard !statistics.isEmpty else { return nil }
        let read = statistics.reduce(UInt64(0)) { $0 + (number($1, "Bytes (Read)")?.uint64Value ?? 0) }
        let write = statistics.reduce(UInt64(0)) { $0 + (number($1, "Bytes (Write)")?.uint64Value ?? 0) }
        return (read, write)
    }

    public func processes() -> [ProcessSample] {
        let estimate = proc_listallpids(nil, 0)
        guard estimate > 0 else { return [] }
        var pids = [pid_t](repeating: 0, count: Int(estimate) + 64)
        let listed = pids.withUnsafeMutableBufferPointer { buffer in
            proc_listallpids(buffer.baseAddress, Int32(buffer.count * MemoryLayout<pid_t>.size))
        }
        guard listed > 0 else { return [] }
        return pids.prefix(Int(listed)).filter { $0 > 0 }.compactMap { sample($0) }
    }

    private func sample(_ pid: pid_t) -> ProcessSample? {
        var task = proc_taskinfo()
        let taskSize = Int32(MemoryLayout<proc_taskinfo>.size)
        guard proc_pidinfo(pid, PROC_PIDTASKINFO, 0, &task, taskSize) == taskSize else { return nil }
        var bsd = proc_bsdinfo()
        let bsdSize = Int32(MemoryLayout<proc_bsdinfo>.size)
        guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &bsd, bsdSize) == bsdSize else { return nil }
        var buffer = [CChar](repeating: 0, count: 256)
        let length = proc_name(pid, &buffer, UInt32(buffer.count))
        let name = length > 0 ? String(decoding: buffer.prefix(Int(length)).map { UInt8(bitPattern: $0) }, as: UTF8.self) : "pid \(pid)"
        let ticks = Double(task.pti_total_user) + Double(task.pti_total_system)
        let nanos = UInt64(ticks * timebaseNumer / timebaseDenom)
        return ProcessSample(pid: pid, name: name, uid: bsd.pbi_uid, cpuNanos: nanos, residentBytes: task.pti_resident_size)
    }
}
