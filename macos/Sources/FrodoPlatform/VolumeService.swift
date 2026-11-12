import AudioToolbox
import CoreAudio
import FrodoCore
import Foundation

@MainActor
public protocol AudioDevices {
    func defaultOutput() -> AudioObjectID?
    func defaultInput() -> AudioObjectID?
    func name(of device: AudioObjectID) -> String
    func outputVolume(of device: AudioObjectID) -> Float32?
    func setOutputVolume(_ scalar: Float32, of device: AudioObjectID)
    func inputMute(of device: AudioObjectID) -> Bool?
    func setInputMute(_ muted: Bool, of device: AudioObjectID)
    func inputVolume(of device: AudioObjectID) -> Float32?
    func setInputVolume(_ scalar: Float32, of device: AudioObjectID)
    func onDefaultOutputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe
    func onOutputVolumeChange(of device: AudioObjectID, _ handler: @escaping @MainActor () -> Void) -> Unsubscribe
}

private func address(_ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope, element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: element)
}

private let systemObject = AudioObjectID(kAudioObjectSystemObject)
private let outputVolumeAddress = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, scope: kAudioDevicePropertyScopeOutput)
private let inputMuteAddress = address(kAudioDevicePropertyMute, scope: kAudioDevicePropertyScopeInput)

@MainActor
public struct CoreAudioDevices: AudioDevices {
    public init() {}

    public func defaultOutput() -> AudioObjectID? {
        defaultDevice(kAudioHardwarePropertyDefaultOutputDevice)
    }

    public func defaultInput() -> AudioObjectID? {
        defaultDevice(kAudioHardwarePropertyDefaultInputDevice)
    }

    public func name(of device: AudioObjectID) -> String {
        var target = address(kAudioObjectPropertyName, scope: kAudioObjectPropertyScopeGlobal)
        var name: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(device, &target, 0, nil, &size, &name) == noErr, let name else { return "" }
        return name.takeRetainedValue() as String
    }

    public func outputVolume(of device: AudioObjectID) -> Float32? {
        read(device, outputVolumeAddress, Float32(0))
    }

    public func setOutputVolume(_ scalar: Float32, of device: AudioObjectID) {
        write(device, outputVolumeAddress, scalar)
    }

    public func inputMute(of device: AudioObjectID) -> Bool? {
        guard settable(device, inputMuteAddress) else { return nil }
        return (read(device, inputMuteAddress, UInt32(0)) ?? 0) != 0
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

    public func onDefaultOutputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        listen(systemObject, address(kAudioHardwarePropertyDefaultOutputDevice, scope: kAudioObjectPropertyScopeGlobal), handler)
    }

    public func onOutputVolumeChange(of device: AudioObjectID, _ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        listen(device, outputVolumeAddress, handler)
    }

    private func defaultDevice(_ selector: AudioObjectPropertySelector) -> AudioObjectID? {
        guard let device = read(systemObject, address(selector, scope: kAudioObjectPropertyScopeGlobal), AudioObjectID(kAudioObjectUnknown)), device != kAudioObjectUnknown
        else { return nil }
        return device
    }

    private func inputVolumeAddress(_ device: AudioObjectID) -> AudioObjectPropertyAddress? {
        [kAudioObjectPropertyElementMain, 1]
            .map { address(kAudioDevicePropertyVolumeScalar, scope: kAudioDevicePropertyScopeInput, element: $0) }
            .first { settable(device, $0) }
    }

    private func settable(_ device: AudioObjectID, _ target: AudioObjectPropertyAddress) -> Bool {
        var target = target
        var result: DarwinBoolean = false
        guard AudioObjectHasProperty(device, &target), AudioObjectIsPropertySettable(device, &target, &result) == noErr else { return false }
        return result.boolValue
    }

    private func read<Value>(_ device: AudioObjectID, _ target: AudioObjectPropertyAddress, _ initial: Value) -> Value? {
        var target = target
        var value = initial
        var size = UInt32(MemoryLayout<Value>.size)
        return AudioObjectGetPropertyData(device, &target, 0, nil, &size, &value) == noErr ? value : nil
    }

    private func write<Value>(_ device: AudioObjectID, _ target: AudioObjectPropertyAddress, _ value: Value) {
        var target = target
        var value = value
        AudioObjectSetPropertyData(device, &target, 0, nil, UInt32(MemoryLayout<Value>.size), &value)
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
}

private func volumePercent(_ scalar: Float32) -> Int {
    Int((scalar * 100).rounded())
}

@MainActor
public final class VolumeService: VolumeSource, Destroyable {
    public let changed = Event<Int>()
    public let statusChanged = Event<Void>()
    public private(set) var percent = 0
    public private(set) var outputName = ""

    private let devices: AudioDevices
    private var outputDevice: AudioObjectID?
    private var stopVolume: Unsubscribe?
    private var stopDevice: Unsubscribe?
    private var savedInputVolume: Float32?
    private var primed = false

    public init(devices: AudioDevices = CoreAudioDevices()) {
        self.devices = devices
        attachOutputDevice()
        stopDevice = devices.onDefaultOutputChange { [weak self] in self?.attachOutputDevice() }
        primed = true
    }

    public func setPercent(_ value: Int) {
        guard let outputDevice else { return }
        devices.setOutputVolume(Float32(min(100, max(0, value))) / 100, of: outputDevice)
    }

    public var canMuteInput: Bool {
        guard let device = devices.defaultInput() else { return false }
        return devices.inputMute(of: device) != nil || devices.inputVolume(of: device) != nil
    }

    public var isInputMuted: Bool {
        guard let device = devices.defaultInput() else { return false }
        if let muted = devices.inputMute(of: device) { return muted }
        if let volume = devices.inputVolume(of: device) { return volume <= 0.001 }
        return false
    }

    @discardableResult
    public func setInputMuted(_ muted: Bool) -> Bool {
        guard let device = devices.defaultInput() else { return false }
        if devices.inputMute(of: device) != nil {
            devices.setInputMute(muted, of: device)
        } else if let current = devices.inputVolume(of: device) {
            if muted, current > 0.001 { savedInputVolume = current }
            devices.setInputVolume(muted ? 0 : (savedInputVolume ?? 0.75), of: device)
        } else {
            return false
        }
        statusChanged.emit()
        return isInputMuted == muted
    }

    private func attachOutputDevice() {
        stopVolume?()
        stopVolume = nil
        guard let device = devices.defaultOutput() else { return }
        outputDevice = device
        outputName = devices.name(of: device)
        percent = devices.outputVolume(of: device).map(volumePercent) ?? percent
        stopVolume = devices.onOutputVolumeChange(of: device) { [weak self] in self?.volumeChanged() }
        if primed { statusChanged.emit() }
    }

    private func volumeChanged() {
        guard let outputDevice, let value = devices.outputVolume(of: outputDevice).map(volumePercent), value != percent else { return }
        percent = value
        if primed { changed.emit(value) }
    }

    public func destroy() {
        stopVolume?()
        stopVolume = nil
        stopDevice?()
        stopDevice = nil
        changed.clearListeners()
        statusChanged.clearListeners()
    }
}
