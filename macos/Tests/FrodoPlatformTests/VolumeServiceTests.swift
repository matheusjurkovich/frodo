import CoreAudio
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@MainActor
private final class FakeAudioDevices: AudioDevices {
    var output: AudioObjectID? = 1
    var input: AudioObjectID? = 10
    var names: [AudioObjectID: String] = [1: "Alto-falantes do MacBook", 2: "AirPods"]
    var volumes: [AudioObjectID: Float32] = [1: 0.5, 2: 0.2]
    var muteSupported = true
    var muted = false
    var inputLevel: Float32?
    private var outputWatchers: [Int: @MainActor () -> Void] = [:]
    private var volumeWatchers: [Int: (device: AudioObjectID, handler: @MainActor () -> Void)] = [:]
    private var nextId = 0

    var volumeWatcherCount: Int { volumeWatchers.count }

    func defaultOutput() -> AudioObjectID? { output }
    func defaultInput() -> AudioObjectID? { input }
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
}
