import FrodoCore
import FrodoPlatform
import SwiftUI

struct GeneralTab: View {
    let services: FrodoServices

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(spacing: 10) {
                SettingsPanesCard()
                ShortcutsCard(services: services)
            }
            VStack(spacing: 10) {
                SoundCard(services: services)
                MediaCard(services: services)
                SystemCard(services: services)
            }
            .frame(width: 330)
        }
        AppsCard(services: services)
    }
}

private struct SettingsPanesCard: View {
    private let panes: [(symbol: String, title: String, subtitle: String, pane: String)] = [
        ("wifi", "Wi-Fi", "Abrir Ajustes", "com.apple.wifi-settings-extension"),
        ("antenna.radiowaves.left.and.right", "Bluetooth", "Abrir Ajustes", "com.apple.BluetoothSettings"),
        ("speaker.wave.2", "Som", "Abrir Ajustes", "com.apple.Sound-Settings.extension"),
        ("battery.100", "Bateria", "Abrir Ajustes", "com.apple.Battery-Settings.extension"),
        ("moon", "Foco", "Abrir Ajustes", "com.apple.Focus-Settings.extension"),
        ("display", "Tela", "Abrir Ajustes", "com.apple.Displays-Settings.extension"),
    ]

    var body: some View {
        CardView(title: "Ajustes do Sistema") {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                ForEach(panes.indices, id: \.self) { index in
                    let pane = panes[index]
                    Button { launchExternal { SystemActions.openSystemSettings(pane: pane.pane) } } label: {
                        HStack(spacing: 10) {
                            FrodoIcon(name: "", size: 18, color: Theme.text, system: pane.symbol)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(pane.title).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text)
                                Text(pane.subtitle).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 56)
                        .hoverBackground(Theme.control)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct ShortcutsCard: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.volume
        CollapsibleCard(services: services, id: .shortcuts, title: "Atalhos") {
            let micMuted = services.volume.isInputMuted
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                tile("screenshot", "Captura") { launchExternal { SystemActions.openScreenshotTool() } }
                tile("record", "Gravar tela") { launchExternal { SystemActions.openScreenshotTool() } }
                tile("mic-off", micMuted ? "Ativar mic" : "Silenciar mic", highlighted: micMuted) {
                    _ = services.volume.setInputMuted(!micMuted)
                    services.revisions.volume += 1
                }
                tile("terminal", "Terminal") { launchExternal { SystemActions.openTerminal() } }
                tile("folder", "Arquivos") { launchExternal { SystemActions.openFinder() } }
                tile("lock", "Bloquear") { launchExternal { SystemActions.lockScreen() } }
            }
        }
    }

    private func tile(_ icon: String, _ title: String, highlighted: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                FrodoIcon(name: icon, size: 20, color: highlighted ? .white : Theme.text)
                Text(title).font(Theme.Font.label(.medium)).foregroundStyle(highlighted ? .white : Theme.textSecondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 64)
            .hoverBackground(highlighted ? Theme.accent : Theme.control)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct SoundCard: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.volume
        CardView(title: "Som") {
            HStack(spacing: 10) {
                FrodoIcon(name: "wave", size: 16, color: Theme.textSecondary)
                FrodoSlider(
                    value: Binding(get: { Double(services.volume.percent) }, set: { services.volume.setPercent(Int($0)); services.revisions.volume += 1 })
                )
                Text("\(services.volume.percent)%").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).monospacedDigit().frame(width: 40, alignment: .trailing)
            }
            if !services.volume.outputName.isEmpty {
                Text(services.volume.outputName).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            }
        }
    }
}

private struct MediaCard: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.media
        CardView(title: "Tocando agora") {
            if let track = services.media.current {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.control)
                        FrodoIcon(name: "music", size: 24, color: Theme.accentText)
                    }
                    .frame(width: 60, height: 60)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                        Text(track.artist).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).lineLimit(1)
                        Text(track.app).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                    }
                    Spacer(minLength: 0)
                }
                HStack(spacing: 14) {
                    Spacer()
                    IconButton(icon: "previous", size: 36, iconSize: 14) { services.media.previous() }
                    Button { services.media.playPause() } label: {
                        FrodoIcon(name: track.playing ? "pause" : "play", size: 18, color: .black).frame(width: 44, height: 44).background(Circle().fill(Theme.text))
                    }
                    .buttonStyle(.plain)
                    IconButton(icon: "next", size: 36, iconSize: 14) { services.media.next() }
                    Spacer()
                }
            } else {
                Text("Nada tocando. Funciona com Música e Spotify.").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
            }
        }
    }
}

private struct SystemCard: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.system
        CardView(title: "Sistema") {
            if let battery = services.system.batteryInfo {
                row("Bateria", "\(battery.percent)%\(battery.charging ? " · carregando" : "")", fraction: Double(battery.percent) / 100)
            }
            if let memory = services.system.memoryInfo {
                row("Memória", "\(formatGb(memory.usedBytes)) de \(formatGb(memory.totalBytes))", fraction: Double(memory.usedBytes) / Double(max(1, memory.totalBytes)))
            }
        }
        .onAppear { services.system.setWantsMemory(true) }
        .onDisappear { services.system.setWantsMemory(false) }
    }

    private func row(_ title: String, _ value: String, fraction: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
                Spacer()
                Text(value).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).monospacedDigit()
            }
            ProgressBar(fraction: fraction, tint: Theme.accent, height: 6)
        }
    }
}

private struct AppsCard: View {
    let services: FrodoServices

    var body: some View {
        let _ = services.revisions.apps
        CollapsibleCard(services: services, id: .apps, title: "Programas abertos") {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 6), spacing: 8) {
                ForEach(services.apps.apps) { app in
                    Button { launchExternal { services.apps.activate(app) } } label: {
                        VStack(spacing: 6) {
                            if let icon = app.icon { Image(nsImage: icon).resizable().frame(width: 30, height: 30) }
                            Text(app.name).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 64)
                        .hoverBackground(Theme.control)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
