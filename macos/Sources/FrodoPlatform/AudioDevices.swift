import AudioToolbox
import CoreAudio
import FrodoCore
import Foundation

public struct AudioDevice: Equatable, Sendable {
    public let id: AudioObjectID
    public let name: String
    public let isInput: Bool

    public init(id: AudioObjectID, name: String, isInput: Bool) {
        self.id = id
        self.name = name
        self.isInput = isInput
    }
}

public struct AudioProcess: Equatable, Sendable {
    public let pid: Int32
    public let bundleId: String?
    public let output: Bool
    public let input: Bool

    public init(pid: Int32, bundleId: String?, output: Bool, input: Bool) {
        self.pid = pid
        self.bundleId = bundleId
        self.output = output
        self.input = input
    }
}

@MainActor
public protocol AudioDevices {
    func defaultOutput() -> AudioObjectID?
    func defaultInput() -> AudioObjectID?
    func devices(input: Bool) -> [AudioDevice]
    func setDefault(_ id: AudioObjectID, input: Bool)
    func name(of device: AudioObjectID) -> String
    func outputVolume(of device: AudioObjectID) -> Float32?
    func setOutputVolume(_ scalar: Float32, of device: AudioObjectID)
    func outputMute(of device: AudioObjectID) -> Bool?
    func setOutputMute(_ muted: Bool, of device: AudioObjectID)
    func inputMute(of device: AudioObjectID) -> Bool?
    func setInputMute(_ muted: Bool, of device: AudioObjectID)
    func inputVolume(of device: AudioObjectID) -> Float32?
    func setInputVolume(_ scalar: Float32, of device: AudioObjectID)
    func processes() -> [AudioProcess]?
    func onDefaultOutputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe
    func onDefaultInputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe
    func onDevicesChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe
    func onOutputVolumeChange(of device: AudioObjectID, _ handler: @escaping @MainActor () -> Void) -> Unsubscribe
    func onProcessesChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe
}

private func address(_ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: element)
}

private let systemObject = AudioObjectID(kAudioObjectSystemObject)
private let outputVolumeAddress = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, scope: kAudioDevicePropertyScopeOutput)
private let outputMuteAddress = address(kAudioDevicePropertyMute, scope: kAudioDevicePropertyScopeOutput)
private let inputMuteAddress = address(kAudioDevicePropertyMute, scope: kAudioDevicePropertyScopeInput)

private func settable(_ object: AudioObjectID, _ target: AudioObjectPropertyAddress) -> Bool {
    var target = target
    var result: DarwinBoolean = false
    guard AudioObjectHasProperty(object, &target), AudioObjectIsPropertySettable(object, &target, &result) == noErr else { return false }
    return result.boolValue
}

private func dataSize(_ object: AudioObjectID, _ target: AudioObjectPropertyAddress) -> UInt32 {
    var target = target
    var size: UInt32 = 0
    return AudioObjectGetPropertyDataSize(object, &target, 0, nil, &size) == noErr ? size : 0
}

private func read<Value>(_ object: AudioObjectID, _ target: AudioObjectPropertyAddress, _ initial: Value) -> Value? {
    var target = target
    var value = initial
    var size = UInt32(MemoryLayout<Value>.size)
    return AudioObjectGetPropertyData(object, &target, 0, nil, &size, &value) == noErr ? value : nil
}

private func readFlag(_ object: AudioObjectID, _ target: AudioObjectPropertyAddress) -> Bool {
    (read(object, target, UInt32(0)) ?? 0) != 0
}

private func readString(_ object: AudioObjectID, _ target: AudioObjectPropertyAddress) -> String? {
    var target = target
    var text: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(object, &target, 0, nil, &size, &text) == noErr, let text else { return nil }
    return text.takeRetainedValue() as String
}

private func readObjects(_ object: AudioObjectID, _ target: AudioObjectPropertyAddress) -> [AudioObjectID] {
    var target = target
    var size = dataSize(object, target)
    let stride = MemoryLayout<AudioObjectID>.stride
    guard size > 0 else { return [] }
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / stride)
    guard AudioObjectGetPropertyData(object, &target, 0, nil, &size, &ids) == noErr else { return [] }
    return Array(ids.prefix(Int(size) / stride))
}

private func write<Value>(_ object: AudioObjectID, _ target: AudioObjectPropertyAddress, _ value: Value) {
    var target = target
    var value = value
    AudioObjectSetPropertyData(object, &target, 0, nil, UInt32(MemoryLayout<Value>.size), &value)
}

private func listen(_ object: AudioObjectID, _ target: AudioObjectPropertyAddress, _ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
    let block: AudioObjectPropertyListenerBlock = { @Sendable _, _ in
        MainActor.assumeIsolated { handler() }
    }
    var adding = target
    guard AudioObjectAddPropertyListenerBlock(object, &adding, .main, block) == noErr else { return {} }
    return {
        var removing = target
        AudioObjectRemovePropertyListenerBlock(object, &removing, .main, block)
    }
}

@available(macOS 14.2, *)
private func processObjects() -> [AudioObjectID] {
    readObjects(systemObject, address(kAudioHardwarePropertyProcessObjectList))
}

@MainActor
private final class ListenerGroup {
    private var stops: [Unsubscribe] = []

    func replace(with next: [Unsubscribe]) {
        for stop in stops { stop() }
        stops = next
    }
}

@MainActor
public struct CoreAudioDevices: AudioDevices {
    public init() {}

    public func defaultOutput() -> AudioObjectID? {
        defaultDevice(kAudioHardwarePropertyDefaultOutputDevice)
    }

    public func defaultInput() -> AudioObjectID? {
        defaultDevice(kAudioHardwarePropertyDefaultInputDevice)
    }

    public func devices(input: Bool) -> [AudioDevice] {
        let streams = address(kAudioDevicePropertyStreams, scope: input ? kAudioDevicePropertyScopeInput : kAudioDevicePropertyScopeOutput)
        return readObjects(systemObject, address(kAudioHardwarePropertyDevices))
            .filter { dataSize($0, streams) > 0 }
            .map { AudioDevice(id: $0, name: name(of: $0), isInput: input) }
    }

    public func setDefault(_ id: AudioObjectID, input: Bool) {
        write(systemObject, address(input ? kAudioHardwarePropertyDefaultInputDevice : kAudioHardwarePropertyDefaultOutputDevice), id)
    }

    public func name(of device: AudioObjectID) -> String {
        readString(device, address(kAudioObjectPropertyName)) ?? ""
    }

    public func outputVolume(of device: AudioObjectID) -> Float32? {
        read(device, outputVolumeAddress, Float32(0))
    }

    public func setOutputVolume(_ scalar: Float32, of device: AudioObjectID) {
        write(device, outputVolumeAddress, scalar)
    }

    public func outputMute(of device: AudioObjectID) -> Bool? {
        settable(device, outputMuteAddress) ? readFlag(device, outputMuteAddress) : nil
    }

    public func setOutputMute(_ muted: Bool, of device: AudioObjectID) {
        write(device, outputMuteAddress, UInt32(muted ? 1 : 0))
    }

    public func inputMute(of device: AudioObjectID) -> Bool? {
        settable(device, inputMuteAddress) ? readFlag(device, inputMuteAddress) : nil
    }

    public func setInputMute(_ muted: Bool, of device: AudioObjectID) {
        write(device, inputMuteAddress, UInt32(muted ? 1 : 0))
    }

    public func inputVolume(of device: AudioObjectID) -> Float32? {
        guard let target = inputVolumeAddress(device) else { return nil }
        return read(device, target, Float32(0)) ?? 1
    }

    public func setInputVolume(_ scalar: Float32, of device: AudioObjectID) {
        guard let target = inputVolumeAddress(device) else { return }
        write(device, target, scalar)
    }

    public func processes() -> [AudioProcess]? {
        guard #available(macOS 14.2, *) else { return nil }
        return processObjects().compactMap { object -> AudioProcess? in
            guard let pid = read(object, address(kAudioProcessPropertyPID), pid_t(0)) else { return nil }
            let bundleId = readString(object, address(kAudioProcessPropertyBundleID)).flatMap { $0.isEmpty ? nil : $0 }
            return AudioProcess(
                pid: pid, bundleId: bundleId,
                output: readFlag(object, address(kAudioProcessPropertyIsRunningOutput)),
                input: readFlag(object, address(kAudioProcessPropertyIsRunningInput))
            )
        }
    }

    public func onDefaultOutputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        listen(systemObject, address(kAudioHardwarePropertyDefaultOutputDevice), handler)
    }

    public func onDefaultInputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        listen(systemObject, address(kAudioHardwarePropertyDefaultInputDevice), handler)
    }

    public func onDevicesChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        listen(systemObject, address(kAudioHardwarePropertyDevices), handler)
    }

    public func onOutputVolumeChange(of device: AudioObjectID, _ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        listen(device, outputVolumeAddress, handler)
    }

    public func onProcessesChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        guard #available(macOS 14.2, *) else { return {} }
        let running = ListenerGroup()
        let watchRunning: @MainActor () -> Void = {
            running.replace(with: processObjects().flatMap { object -> [Unsubscribe] in
                [kAudioProcessPropertyIsRunningOutput, kAudioProcessPropertyIsRunningInput].map { listen(object, address($0), handler) }
            })
        }
        watchRunning()
        let stopList = listen(systemObject, address(kAudioHardwarePropertyProcessObjectList)) {
            watchRunning()
            handler()
        }
        return {
            stopList()
            running.replace(with: [])
        }
    }

    private func defaultDevice(_ selector: AudioObjectPropertySelector) -> AudioObjectID? {
        guard let device = read(systemObject, address(selector), AudioObjectID(kAudioObjectUnknown)), device != kAudioObjectUnknown else { return nil }
        return device
    }

    private func inputVolumeAddress(_ device: AudioObjectID) -> AudioObjectPropertyAddress? {
        [kAudioObjectPropertyElementMain, 1]
            .map { address(kAudioDevicePropertyVolumeScalar, scope: kAudioDevicePropertyScopeInput, element: $0) }
            .first { settable(device, $0) }
    }
}
