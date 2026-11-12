import FrodoCore
import Foundation
import IOKit.ps

private let memorySeconds: TimeInterval = 5
private let alarmSeconds: TimeInterval = 30

public enum MemoryDemand: Hashable, Sendable {
    case pill
    case card
}

private func powerSourceChanged(_ context: UnsafeMutableRawPointer?) {
    guard let context else { return }
    let state = Unmanaged<SystemState>.fromOpaque(context).takeUnretainedValue()
    MainActor.assumeIsolated { state.readBattery() }
}

@MainActor
public final class SystemState: Destroyable {
    public let battery = Event<Void>()
    public let memory = Event<Void>()
    public private(set) var batteryInfo: BatteryInfo?
    public private(set) var memoryInfo: MemoryInfo?

    private let timer: TimerSlot
    private var memoryDemands: Set<MemoryDemand> = []
    private var powerSource: CFRunLoopSource?

    public init(scheduler: Scheduler) {
        timer = TimerSlot(scheduler: scheduler)
        readBattery()
        let context = Unmanaged.passUnretained(self).toOpaque()
        let source = IOPSNotificationCreateRunLoopSource(powerSourceChanged, context)?.takeRetainedValue()
        if let source { CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes) }
        powerSource = source
        pollMemory(every: alarmSeconds)
    }

    public func setWantsMemory(_ wants: Bool, by owner: MemoryDemand) {
        let wasWanted = !memoryDemands.isEmpty
        if wants { memoryDemands.insert(owner) } else { memoryDemands.remove(owner) }
        let isWanted = !memoryDemands.isEmpty
        guard isWanted != wasWanted else { return }
        if isWanted { readMemory() }
        pollMemory(every: isWanted ? memorySeconds : alarmSeconds)
    }

    private func pollMemory(every seconds: TimeInterval) {
        timer.every(seconds) { [weak self] in self?.readMemory() }
    }

    fileprivate func readBattery() {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(), let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] else { return }
        var found: BatteryInfo?
        for source in list {
            guard let description = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
                description[kIOPSTypeKey] as? String == kIOPSInternalBatteryType,
                let capacity = description[kIOPSCurrentCapacityKey] as? Int, let maximum = description[kIOPSMaxCapacityKey] as? Int, maximum > 0
            else { continue }
            let charging = (description[kIOPSIsChargingKey] as? Bool) ?? false
            found = BatteryInfo(percent: capacity * 100 / maximum, charging: charging)
        }
        if found != batteryInfo {
            batteryInfo = found
            battery.emit()
        }
    }

    private func readMemory() {
        var statistics = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        let result = withUnsafeMutablePointer(to: &statistics) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count) }
        }
        guard result == KERN_SUCCESS else { return }
        var hostPageSize: vm_size_t = 0
        guard host_page_size(mach_host_self(), &hostPageSize) == KERN_SUCCESS else { return }
        let pageSize = UInt64(hostPageSize)
        let used = (UInt64(statistics.active_count) + UInt64(statistics.wire_count) + UInt64(statistics.compressor_page_count)) * pageSize
        let info = MemoryInfo(totalBytes: ProcessInfo.processInfo.physicalMemory, usedBytes: used)
        if info != memoryInfo {
            memoryInfo = info
            memory.emit()
        }
    }

    public func destroy() {
        timer.stop()
        if let powerSource { CFRunLoopRemoveSource(CFRunLoopGetMain(), powerSource, .commonModes) }
        battery.clearListeners()
        memory.clearListeners()
    }
}
