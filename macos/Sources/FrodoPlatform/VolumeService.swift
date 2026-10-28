import AudioToolbox
import CoreAudio
import FrodoCore
import Foundation

private func address(_ selector: AudioObjectPropertySelector, scope: AudioObjectPropertyScope) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

@MainActor
public final class VolumeService: VolumeSource, Destroyable {
    public let changed = Event<Int>()
    public private(set) var percent = 0
    public private(set) var outputName = ""

    private var outputDevice = AudioObjectID(kAudioObjectUnknown)
    private var volumeListener: AudioObjectPropertyListenerBlock?
    private var deviceListener: AudioObjectPropertyListenerBlock?
    private var primed = false

    public init() {
        attachOutputDevice()
        var defaultOutput = address(kAudioHardwarePropertyDefaultOutputDevice, scope: kAudioObjectPropertyScopeGlobal)
        let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            MainActor.assumeIsolated { self?.attachOutputDevice() }
        }
        deviceListener = listener
        AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &defaultOutput, .main, listener)
        primed = true
    }

    public func setPercent(_ value: Int) {
        guard outputDevice != kAudioObjectUnknown else { return }
        var scalar = Float32(min(100, max(0, value))) / 100
        var volumeAddress = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, scope: kAudioDevicePropertyScopeOutput)
        AudioObjectSetPropertyData(outputDevice, &volumeAddress, 0, nil, UInt32(MemoryLayout<Float32>.size), &scalar)
    }

    private var savedInputVolume: Float32?

    private func inputAddress(_ selector: AudioObjectPropertySelector, element: AudioObjectPropertyElement) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioDevicePropertyScopeInput, mElement: element)
    }

    private func settable(_ device: AudioObjectID, _ address: AudioObjectPropertyAddress) -> Bool {
        var mutable = address
        var result: DarwinBoolean = false
        guard AudioObjectHasProperty(device, &mutable), AudioObjectIsPropertySettable(device, &mutable, &result) == noErr else { return false }
        return result.boolValue
    }

    private func inputVolumeAddress(_ device: AudioObjectID) -> AudioObjectPropertyAddress? {
        [kAudioObjectPropertyElementMain, 1]
            .map { inputAddress(kAudioDevicePropertyVolumeScalar, element: $0) }
            .first { settable(device, $0) }
    }

    private func readUInt32(_ device: AudioObjectID, _ address: AudioObjectPropertyAddress) -> UInt32? {
        var mutable = address
        var value: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        return AudioObjectGetPropertyData(device, &mutable, 0, nil, &size, &value) == noErr ? value : nil
    }

    private func readFloat(_ device: AudioObjectID, _ address: AudioObjectPropertyAddress) -> Float32? {
        var mutable = address
        var value: Float32 = 0
        var size = UInt32(MemoryLayout<Float32>.size)
        return AudioObjectGetPropertyData(device, &mutable, 0, nil, &size, &value) == noErr ? value : nil
    }

    public var canMuteInput: Bool {
        guard let device = defaultDevice(kAudioHardwarePropertyDefaultInputDevice) else { return false }
        return settable(device, inputAddress(kAudioDevicePropertyMute, element: kAudioObjectPropertyElementMain)) || inputVolumeAddress(device) != nil
    }

    public var isInputMuted: Bool {
        guard let device = defaultDevice(kAudioHardwarePropertyDefaultInputDevice) else { return false }
        let muteAddress = inputAddress(kAudioDevicePropertyMute, element: kAudioObjectPropertyElementMain)
        if settable(device, muteAddress), let muted = readUInt32(device, muteAddress) { return muted != 0 }
        if let address = inputVolumeAddress(device), let volume = readFloat(device, address) { return volume <= 0.001 }
        return false
    }

    @discardableResult
    public func setInputMuted(_ muted: Bool) -> Bool {
        guard let device = defaultDevice(kAudioHardwarePropertyDefaultInputDevice) else { return false }
        var muteAddress = inputAddress(kAudioDevicePropertyMute, element: kAudioObjectPropertyElementMain)
        if settable(device, muteAddress) {
            var value: UInt32 = muted ? 1 : 0
            AudioObjectSetPropertyData(device, &muteAddress, 0, nil, UInt32(MemoryLayout<UInt32>.size), &value)
        } else if var address = inputVolumeAddress(device) {
            let current = readFloat(device, address) ?? 1
            if muted, current > 0.001 { savedInputVolume = current }
            var target: Float32 = muted ? 0 : (savedInputVolume ?? 0.75)
            AudioObjectSetPropertyData(device, &address, 0, nil, UInt32(MemoryLayout<Float32>.size), &target)
        } else {
            return false
        }
        return isInputMuted == muted
    }

    private func defaultDevice(_ selector: AudioObjectPropertySelector) -> AudioObjectID? {
        var deviceAddress = address(selector, scope: kAudioObjectPropertyScopeGlobal)
        var device = AudioObjectID(kAudioObjectUnknown)
        var size = UInt32(MemoryLayout<AudioObjectID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &deviceAddress, 0, nil, &size, &device) == noErr, device != kAudioObjectUnknown else { return nil }
        return device
    }

    private func readVolume(of device: AudioObjectID) -> Int? {
        var volumeAddress = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, scope: kAudioDevicePropertyScopeOutput)
        var scalar: Float32 = 0
        var size = UInt32(MemoryLayout<Float32>.size)
        guard AudioObjectGetPropertyData(device, &volumeAddress, 0, nil, &size, &scalar) == noErr else { return nil }
        return Int((scalar * 100).rounded())
    }

    private func readName(of device: AudioObjectID) -> String {
        var nameAddress = address(kAudioObjectPropertyName, scope: kAudioObjectPropertyScopeGlobal)
        var name: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(device, &nameAddress, 0, nil, &size, &name) == noErr, let name else { return "" }
        return name.takeRetainedValue() as String
    }

    private func attachOutputDevice() {
        if let listener = volumeListener, outputDevice != kAudioObjectUnknown {
            var volumeAddress = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, scope: kAudioDevicePropertyScopeOutput)
            AudioObjectRemovePropertyListenerBlock(outputDevice, &volumeAddress, .main, listener)
        }
        guard let device = defaultDevice(kAudioHardwarePropertyDefaultOutputDevice) else { return }
        outputDevice = device
        outputName = readName(of: device)
        percent = readVolume(of: device) ?? percent
        let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in
            MainActor.assumeIsolated { self?.volumeChanged() }
        }
        volumeListener = listener
        var volumeAddress = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, scope: kAudioDevicePropertyScopeOutput)
        AudioObjectAddPropertyListenerBlock(device, &volumeAddress, .main, listener)
    }

    private func volumeChanged() {
        guard let value = readVolume(of: outputDevice), value != percent else { return }
        percent = value
        if primed { changed.emit(value) }
    }

    public func destroy() {
        if let listener = volumeListener, outputDevice != kAudioObjectUnknown {
            var volumeAddress = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, scope: kAudioDevicePropertyScopeOutput)
            AudioObjectRemovePropertyListenerBlock(outputDevice, &volumeAddress, .main, listener)
        }
        if let listener = deviceListener {
            var defaultOutput = address(kAudioHardwarePropertyDefaultOutputDevice, scope: kAudioObjectPropertyScopeGlobal)
            AudioObjectRemovePropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &defaultOutput, .main, listener)
        }
        changed.clearListeners()
    }
}
