import AppKit
import CoreAudio
import FrodoCore
import FrodoPlatform

@MainActor
final class DemoAudioDevices: AudioDevices {
    private let outputs = [AudioDevice(id: 1, name: "Alto-falantes do MacBook Pro", isInput: false), AudioDevice(id: 2, name: "AirPods Pro", isInput: false)]
    private let inputs = [AudioDevice(id: 11, name: "Microfone do MacBook Pro", isInput: true), AudioDevice(id: 12, name: "AirPods Pro", isInput: true)]
    private var output: AudioObjectID = 1
    private var input: AudioObjectID = 11
    private var volumes: [AudioObjectID: Float32] = [1: 0.6, 2: 0.4, 11: 0.8, 12: 0.7]
    private var muted: Set<AudioObjectID> = []
    private var watchers: [Int: @MainActor () -> Void] = [:]
    private var nextId = 0

    func defaultOutput() -> AudioObjectID? { output }
    func defaultInput() -> AudioObjectID? { input }
    func devices(input: Bool) -> [AudioDevice] { input ? inputs : outputs }

    func setDefault(_ id: AudioObjectID, input isInput: Bool) {
        if isInput { input = id } else { output = id }
        notify()
    }

    func name(of device: AudioObjectID) -> String {
        (outputs + inputs).first { $0.id == device }?.name ?? ""
    }

    func outputVolume(of device: AudioObjectID) -> Float32? { volumes[device] }
    func inputVolume(of device: AudioObjectID) -> Float32? { volumes[device] }
    func outputMute(of device: AudioObjectID) -> Bool? { muted.contains(device) }
    func inputMute(of device: AudioObjectID) -> Bool? { muted.contains(device) }

    func setOutputVolume(_ scalar: Float32, of device: AudioObjectID) { setVolume(scalar, of: device) }
    func setInputVolume(_ scalar: Float32, of device: AudioObjectID) { setVolume(scalar, of: device) }
    func setOutputMute(_ isMuted: Bool, of device: AudioObjectID) { setMute(isMuted, of: device) }
    func setInputMute(_ isMuted: Bool, of device: AudioObjectID) { setMute(isMuted, of: device) }

    func processes() -> [AudioProcess]? {
        let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }.prefix(3)
        return apps.enumerated().map { index, app in
            AudioProcess(pid: app.processIdentifier, bundleId: app.bundleIdentifier, output: true, input: index == 0)
        }
    }

    func onDefaultOutputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe { watch(handler) }
    func onDefaultInputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe { watch(handler) }
    func onDevicesChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe { watch(handler) }
    func onOutputVolumeChange(of device: AudioObjectID, _ handler: @escaping @MainActor () -> Void) -> Unsubscribe { watch(handler) }
    func onProcessesChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe { watch(handler) }

    private func setVolume(_ scalar: Float32, of device: AudioObjectID) {
        volumes[device] = scalar
        notify()
    }

    private func setMute(_ isMuted: Bool, of device: AudioObjectID) {
        if isMuted { muted.insert(device) } else { muted.remove(device) }
        notify()
    }

    private func watch(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = nextId
        nextId += 1
        watchers[id] = handler
        return { [weak self] in self?.watchers[id] = nil }
    }

    private func notify() {
        for handler in Array(watchers.values) { handler() }
    }
}
