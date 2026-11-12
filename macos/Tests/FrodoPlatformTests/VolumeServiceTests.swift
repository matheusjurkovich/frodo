import CoreAudio
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class FakeAudioDevices: AudioDevices {
    var output: AudioObjectID? = 1
    var input: AudioObjectID? = 10
    var names: [AudioObjectID: String] = [1: "Alto-falantes do MacBook", 2: "AirPods", 10: "Microfone do MacBook", 11: "AirPods"]
    var volumes: [AudioObjectID: Float32] = [1: 0.5, 2: 0.2]
    var muteSupported = true
    var muted = false
    var inputLevel: Float32?
    var outputMuted: Bool? = false
    var outputs = [AudioDevice(id: 1, name: "Alto-falantes do MacBook", isInput: false), AudioDevice(id: 2, name: "AirPods", isInput: false)]
    var inputs = [AudioDevice(id: 10, name: "Microfone do MacBook", isInput: true), AudioDevice(id: 11, name: "AirPods", isInput: true)]
    var audioProcesses: [AudioProcess]? = []
    private var outputWatchers: [Int: @MainActor () -> Void] = [:]
    private var inputWatchers: [Int: @MainActor () -> Void] = [:]
    private var deviceWatchers: [Int: @MainActor () -> Void] = [:]
    private var processWatchers: [Int: @MainActor () -> Void] = [:]
    private var volumeWatchers: [Int: (device: AudioObjectID, handler: @MainActor () -> Void)] = [:]
    private var nextId = 0

    var volumeWatcherCount: Int { volumeWatchers.count }
    var mixerWatcherCount: Int { inputWatchers.count + deviceWatchers.count + processWatchers.count }

    func defaultOutput() -> AudioObjectID? { output }
    func defaultInput() -> AudioObjectID? { input }
    func devices(input: Bool) -> [AudioDevice] { input ? inputs : outputs }

    func setDefault(_ id: AudioObjectID, input isInput: Bool) {
        if isInput {
            input = id
            for handler in inputWatchers.values { handler() }
        } else {
            switchOutput(to: id)
        }
    }

    func outputMute(of device: AudioObjectID) -> Bool? { outputMuted }
    func setOutputMute(_ muted: Bool, of device: AudioObjectID) { outputMuted = muted }
    func processes() -> [AudioProcess]? { audioProcesses }
    func name(of device: AudioObjectID) -> String { names[device] ?? "" }
    func outputVolume(of device: AudioObjectID) -> Float32? { volumes[device] }

    func setOutputVolume(_ scalar: Float32, of device: AudioObjectID) {
        volumes[device] = scalar
        for watcher in volumeWatchers.values where watcher.device == device { watcher.handler() }
    }

    func inputMute(of device: AudioObjectID) -> Bool? { muteSupported ? muted : nil }
    func setInputMute(_ muted: Bool, of device: AudioObjectID) { self.muted = muted }
    func inputVolume(of device: AudioObjectID) -> Float32? { inputLevel }
    func setInputVolume(_ scalar: Float32, of device: AudioObjectID) { inputLevel = scalar }

    func onDefaultOutputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = take()
        outputWatchers[id] = handler
        return { [weak self] in self?.outputWatchers[id] = nil }
    }

    func onDefaultInputChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = take()
        inputWatchers[id] = handler
        return { [weak self] in self?.inputWatchers[id] = nil }
    }

    func onDevicesChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = take()
        deviceWatchers[id] = handler
        return { [weak self] in self?.deviceWatchers[id] = nil }
    }

    func onProcessesChange(_ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = take()
        processWatchers[id] = handler
        return { [weak self] in self?.processWatchers[id] = nil }
    }

    func changeProcesses(_ list: [AudioProcess]) {
        audioProcesses = list
        for handler in processWatchers.values { handler() }
    }

    func onOutputVolumeChange(of device: AudioObjectID, _ handler: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = take()
        volumeWatchers[id] = (device, handler)
        return { [weak self] in self?.volumeWatchers[id] = nil }
    }

    func switchOutput(to device: AudioObjectID) {
        output = device
        for handler in outputWatchers.values { handler() }
    }

    private func take() -> Int {
        nextId += 1
        return nextId
    }
}

@MainActor
@Suite("VolumeService")
struct VolumeServiceTests {
    @Test("começa com o volume e o nome da saída padrão")
    func readsDefaultOutputOnStart() {
        let service = VolumeService(devices: FakeAudioDevices())
        defer { service.destroy() }
        #expect(service.percent == 50)
        #expect(service.outputName == "Alto-falantes do MacBook")
    }

    @Test("trocar a saída padrão emite statusChanged e atualiza percent e outputName")
    func switchingOutputEmitsStatusAndUpdates() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        var statuses = 0
        _ = service.statusChanged.on { statuses += 1 }
        devices.switchOutput(to: 2)
        #expect(statuses == 1)
        #expect(service.percent == 20)
        #expect(service.outputName == "AirPods")
        #expect(devices.volumeWatcherCount == 1)
    }

    @Test("mudar o volume grava na saída atual, limitado a 0...100, e emite changed")
    func settingVolumeWritesAndEmits() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        var seen: [Int] = []
        _ = service.changed.on { seen.append($0) }
        service.setPercent(30)
        service.setPercent(150)
        #expect(seen == [30, 100])
        #expect(service.percent == 100)
        #expect(devices.volumes[1] == 1)
    }

    @Test("o volume da saída antiga deixa de ser ouvido depois da troca")
    func oldOutputIsNoLongerWatched() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        devices.switchOutput(to: 2)
        var seen: [Int] = []
        _ = service.changed.on { seen.append($0) }
        devices.setOutputVolume(0.9, of: 1)
        #expect(seen.isEmpty)
        #expect(service.percent == 20)
    }

    @Test("silenciar o mic usa a propriedade de mudo quando existe")
    func mutesThroughMuteProperty() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        var statuses = 0
        _ = service.statusChanged.on { statuses += 1 }
        #expect(service.canMuteInput)
        #expect(service.setInputMuted(true))
        #expect(devices.muted)
        #expect(service.isInputMuted)
        #expect(service.setInputMuted(false))
        #expect(!service.isInputMuted)
        #expect(statuses == 2)
    }

    @Test("sem mudo, silenciar zera o volume de entrada e reativar devolve o anterior")
    func mutesThroughInputVolumeFallback() {
        let devices = FakeAudioDevices()
        devices.muteSupported = false
        devices.inputLevel = 0.6
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        #expect(service.setInputMuted(true))
        #expect(devices.inputLevel == 0)
        #expect(service.isInputMuted)
        #expect(service.setInputMuted(false))
        #expect(devices.inputLevel == 0.6)
        #expect(!service.isInputMuted)
    }

    @Test("sem mudo nem volume de entrada, o mic não pode ser silenciado")
    func cannotMuteWithoutControls() {
        let devices = FakeAudioDevices()
        devices.muteSupported = false
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        #expect(!service.canMuteInput)
        #expect(!service.setInputMuted(true))
    }

    @Test("trocar o dispositivo de saída define o padrão e atualiza a saída")
    func usingOutputSetsDefault() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        service.useOutput(2)
        #expect(devices.output == 2)
        #expect(service.output == AudioDevice(id: 2, name: "AirPods", isInput: false))
        #expect(service.percent == 20)
    }

    @Test("trocar o dispositivo de entrada define o padrão e emite statusChanged")
    func usingInputSetsDefault() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        var statuses = 0
        _ = service.statusChanged.on { statuses += 1 }
        service.useInput(11)
        #expect(devices.input == 11)
        #expect(service.input == AudioDevice(id: 11, name: "AirPods", isInput: true))
        #expect(statuses == 1)
    }

    @Test("com a aba visível lista as saídas e as entradas")
    func listsDevicesWhenVisible() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        #expect(service.outputs.isEmpty)
        service.setMixerVisible(true)
        #expect(service.outputs.map(\.name) == ["Alto-falantes do MacBook", "AirPods"])
        #expect(service.inputs.map(\.name) == ["Microfone do MacBook", "AirPods"])
    }

    @Test("separa os apps tocando dos que usam o microfone")
    func splitsPlayingAndRecordingApps() {
        let devices = FakeAudioDevices()
        devices.audioProcesses = [
            AudioProcess(pid: 1, bundleId: "com.spotify.client", output: true, input: false),
            AudioProcess(pid: 2, bundleId: "us.zoom.xos", output: true, input: true),
            AudioProcess(pid: 3, bundleId: "com.apple.Safari", output: false, input: false),
        ]
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        service.setMixerVisible(true)
        #expect(service.playingApps?.map(\.pid) == [1, 2])
        #expect(service.recordingApps?.map(\.pid) == [2])
    }

    @Test("sem lista de processos, antes do macOS 14.2, os apps ficam indisponíveis")
    func processesUnavailableBeforeSonoma142() {
        let devices = FakeAudioDevices()
        devices.audioProcesses = nil
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        service.setMixerVisible(true)
        #expect(service.playingApps == nil)
        #expect(service.recordingApps == nil)
        #expect(service.outputs.count == 2)
    }

    @Test("ouve dispositivos e processos só com a aba visível")
    func listensOnlyWhileVisible() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        #expect(devices.mixerWatcherCount == 0)
        service.setMixerVisible(true)
        service.setMixerVisible(true)
        #expect(devices.mixerWatcherCount == 3)
        var statuses = 0
        _ = service.statusChanged.on { statuses += 1 }
        devices.changeProcesses([AudioProcess(pid: 7, bundleId: nil, output: true, input: false)])
        #expect(service.playingApps?.map(\.pid) == [7])
        #expect(statuses == 1)
        service.setMixerVisible(false)
        #expect(devices.mixerWatcherCount == 0)
        devices.changeProcesses([])
        #expect(service.playingApps?.map(\.pid) == [7])
        #expect(statuses == 1)
    }

    @Test("destroy para de ouvir o mixer")
    func destroyStopsMixerListeners() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        service.setMixerVisible(true)
        service.destroy()
        #expect(devices.mixerWatcherCount == 0)
    }

    @Test("alterna o mudo da saída")
    func togglesOutputMute() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        service.toggleOutputMute()
        #expect(devices.outputMuted == true)
        #expect(service.isOutputMuted)
        service.toggleOutputMute()
        #expect(!service.isOutputMuted)
    }

    @Test("alterna o mudo do microfone")
    func togglesInputMute() {
        let devices = FakeAudioDevices()
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        service.toggleInputMute()
        #expect(service.isInputMuted)
        service.toggleInputMute()
        #expect(!service.isInputMuted)
    }

    @Test("o nível do microfone grava no volume de entrada, limitado a 0...1")
    func setsInputLevel() {
        let devices = FakeAudioDevices()
        devices.inputLevel = 0.5
        let service = VolumeService(devices: devices)
        defer { service.destroy() }
        service.setInputLevel(0.8)
        #expect(devices.inputLevel == 0.8)
        #expect(service.inputLevel == Double(Float32(0.8)))
        service.setInputLevel(2)
        #expect(devices.inputLevel == 1)
    }
}
