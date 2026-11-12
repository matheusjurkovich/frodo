import FrodoCore
import FrodoPlatform
import SwiftUI

private let unavailable = "Disponível a partir do macOS 14.2"

struct MixerTab: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.volume
        let volume = services.volume
        HStack(alignment: .top, spacing: 10) {
            appsCard(volume.playingApps)
            VStack(spacing: 10) {
                if let output = volume.output {
                    CardView(title: "Saída") {
                        DevicePicker(devices: volume.outputs, current: output) { volume.useOutput($0.id) }
                        VolumeControl(
                            icon: "volume", mutedIcon: "volume-off", name: output.name, level: Double(volume.percent) / 100, muted: volume.isOutputMuted,
                            setLevel: { volume.setPercent(Int(($0 * 100).rounded())) }, setMuted: { volume.setOutputMuted($0) }
                        )
                        note("O volume geral limita todos os apps ao mesmo tempo.")
                    }
                }
                if let input = volume.input {
                    CardView(title: "Microfone") {
                        DevicePicker(devices: volume.inputs, current: input) { volume.useInput($0.id) }
                        VolumeControl(
                            icon: "mic", mutedIcon: "mic-off", name: input.name, level: volume.inputLevel ?? 1, muted: volume.isInputMuted,
                            setLevel: { volume.setInputLevel($0) }, setMuted: { _ = volume.setInputMuted($0) }
                        )
                        Text("Usando o microfone agora").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).padding(.top, 4)
                        recorders(volume.recordingApps)
                    }
                }
            }
            .frame(width: 340)
        }
        .onAppear { volume.setMixerVisible(true) }
        .onDisappear { volume.setMixerVisible(false) }
    }

    private func appsCard(_ apps: [AudioProcess]?) -> some View {
        CardView(title: "Volume por app") {
            if let apps {
                ForEach(apps, id: \.pid) { AudioAppRow(process: $0, state: "Tocando agora") }
            } else {
                note(unavailable)
            }
            note("O macOS não deixa mudar o volume de cada app.")
        } trailing: {
            if let apps { Text(playingSummary(apps.count)).font(Theme.Font.label(.medium)).foregroundStyle(Theme.textSecondary) }
        }
    }

    @ViewBuilder
    private func recorders(_ apps: [AudioProcess]?) -> some View {
        if let apps {
            if apps.isEmpty {
                note("Nenhum app usando o microfone")
            } else {
                ForEach(apps, id: \.pid) { AudioAppRow(process: $0, state: "Ouvindo agora") }
            }
        } else {
            note(unavailable)
        }
    }

    private func note(_ text: String) -> some View {
        Text(text).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).fixedSize(horizontal: false, vertical: true)
    }
}

private struct VolumeControl: View {
    let icon: String
    let mutedIcon: String
    let name: String
    let level: Double
    let muted: Bool
    let setLevel: (Double) -> Void
    let setMuted: (Bool) -> Void

    var body: some View {
        HStack(spacing: 10) {
            IconButton(
                icon: muted ? mutedIcon : icon, tint: muted ? Theme.danger : Theme.text,
                help: muted ? "Ativar o som de \(name)" : "Silenciar \(name)"
            ) { setMuted(!muted) }
            FrodoSlider(value: Binding(get: { muted ? 0 : level * 100 }, set: { value in
                if value > 0, muted { setMuted(false) }
                setLevel(value / 100)
            }))
            .opacity(muted ? 0.4 : 1)
            Text(volumeLabel(level: level, muted: muted)).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).monospacedDigit()
                .frame(width: 44, alignment: .trailing)
        }
    }
}
