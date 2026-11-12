import AppKit
import FrodoCore
import SwiftUI

struct ShortcutField: View {
    let services: FrodoServices
    let current: ReferenceWritableKeyPath<FrodoSettings, String>
    let other: ReferenceWritableKeyPath<FrodoSettings, String>

    @State private var capturing = false
    @State private var conflict = false
    @State private var monitor: Any?
    @State private var noticeTask: Task<Void, Never>?

    private var settings: FrodoSettings { services.settings }

    var body: some View {
        HStack(spacing: 10) {
            Text(label).font(Theme.Font.mono(12)).foregroundStyle(conflict ? Theme.danger : Theme.textSecondary)
            TextButton(title: capturing ? "Cancelar" : "Alterar", compact: true) {
                if capturing { finish(nil) } else { start() }
            }
        }
        .onDisappear { finish(nil) }
    }

    private var label: String {
        if capturing { return "Pressione o atalho…" }
        if conflict { return "Já usado na outra ação" }
        return parseShortcut(settings[keyPath: current])?.display ?? "Nenhum"
    }

    private func start() {
        finish(nil)
        noticeTask?.cancel()
        conflict = false
        capturing = true
        services.hotkeys.unregisterAll()
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            MainActor.assumeIsolated { handle(event) }
            return nil
        }
    }

    private func handle(_ event: NSEvent) {
        guard event.keyCode != 53 else { return finish(nil) }
        let flags = event.modifierFlags
        let captured = capturedShortcut(
            key: event.charactersIgnoringModifiers ?? "",
            control: flags.contains(.control),
            option: flags.contains(.option),
            shift: flags.contains(.shift),
            command: flags.contains(.command)
        )
        finish(captured)
    }

    private func finish(_ captured: String?) {
        guard capturing else { return }
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        capturing = false
        var value = settings[keyPath: current]
        if let captured {
            switch claimShortcut(captured, current: value, other: settings[keyPath: other]) {
            case .ok: value = captured
            case .same: break
            case .conflict: warn()
            }
        }
        settings[keyPath: current] = value
    }

    private func warn() {
        conflict = true
        noticeTask = Task {
            try? await Task.sleep(for: .seconds(2))
            if !Task.isCancelled { conflict = false }
        }
    }
}
