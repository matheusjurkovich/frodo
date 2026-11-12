import CoreAudio
import FrodoCore
import Foundation

private func volumePercent(_ scalar: Float32) -> Int {
    Int((scalar * 100).rounded())
}

@MainActor
public final class VolumeService: VolumeSource, Destroyable {
    public let changed = Event<Int>()
    public let statusChanged = Event<Void>()
    public private(set) var percent = 0
    public private(set) var outputName = ""
    public private(set) var outputs: [AudioDevice] = []
    public private(set) var inputs: [AudioDevice] = []
    public private(set) var playingApps: [AudioProcess]? = []
    public private(set) var recordingApps: [AudioProcess]? = []

    private let devices: AudioDevices
    private var outputDevice: AudioObjectID?
    private var stopVolume: Unsubscribe?
    private var stopDevice: Unsubscribe?
    private var savedInputVolume: Float32?
    private var primed = false
    private var mixerVisible = false
    private var stopMixer: [Unsubscribe] = []

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

    public var output: AudioDevice? {
        outputDevice.map { AudioDevice(id: $0, name: outputName, isInput: false) }
    }

    public var input: AudioDevice? {
        devices.defaultInput().map { AudioDevice(id: $0, name: devices.name(of: $0), isInput: true) }
    }

    public var isOutputMuted: Bool {
        outputDevice.flatMap { devices.outputMute(of: $0) } ?? false
    }

    public var inputLevel: Double? {
        devices.defaultInput().flatMap { devices.inputVolume(of: $0) }.map { Double($0) }
    }

    public func useOutput(_ id: AudioObjectID) {
        devices.setDefault(id, input: false)
    }

    public func useInput(_ id: AudioObjectID) {
        devices.setDefault(id, input: true)
        if !mixerVisible { statusChanged.emit() }
    }

    public func setOutputMuted(_ muted: Bool) {
        guard let outputDevice, devices.outputMute(of: outputDevice) != nil else { return }
        devices.setOutputMute(muted, of: outputDevice)
        statusChanged.emit()
    }

    public func toggleOutputMute() {
        setOutputMuted(!isOutputMuted)
    }

    public func setInputLevel(_ level: Double) {
        guard let device = devices.defaultInput() else { return }
        devices.setInputVolume(Float32(min(1, max(0, level))), of: device)
        statusChanged.emit()
    }

    @discardableResult
    public func toggleInputMute() -> Bool {
        setInputMuted(!isInputMuted)
    }

    public func setMixerVisible(_ visible: Bool) {
        guard visible != mixerVisible else { return }
        mixerVisible = visible
        for stop in stopMixer { stop() }
        stopMixer = []
        guard visible else { return }
        reloadDevices()
        reloadProcesses()
        stopMixer = [
            devices.onDevicesChange { [weak self] in
                self?.reloadDevices()
                self?.statusChanged.emit()
            },
            devices.onDefaultInputChange { [weak self] in self?.statusChanged.emit() },
            devices.onProcessesChange { [weak self] in
                self?.reloadProcesses()
                self?.statusChanged.emit()
            },
        ]
        statusChanged.emit()
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

    private func reloadDevices() {
        outputs = devices.devices(input: false)
        inputs = devices.devices(input: true)
    }

    private func reloadProcesses() {
        let list = devices.processes()
        playingApps = list?.filter(\.output)
        recordingApps = list?.filter(\.input)
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
        setMixerVisible(false)
        stopVolume?()
        stopVolume = nil
        stopDevice?()
        stopDevice = nil
        changed.clearListeners()
        statusChanged.clearListeners()
    }
}
