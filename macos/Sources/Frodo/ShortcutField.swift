import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

struct ShortcutRows: View {
    private enum Slot: CaseIterable {
        case toggle, claude

        var keyPath: ReferenceWritableKeyPath<FrodoSettings, String> {
            switch self {
            case .toggle: \.toggleShortcut
            case .claude: \.claudeShortcut
            }
        }

        var other: Slot { self == .toggle ? .claude : .toggle }
        var title: String { self == .toggle ? "Abrir e fechar a ilha" : "Abrir na aba IA" }
    }

    let services: FrodoServices

    @State private var capturing: Slot?
    @State private var conflict: Slot?
    @State private var monitor: Any?
    @State private var noticeTask: Task<Void, Never>?

    private var settings: FrodoSettings { services.settings }

    var body: some View {
        Group {
            ForEach(Slot.allCases, id: \.self) { slot in
                SettingRow(slot.title) {
                    HStack(spacing: 10) {
                        Text(label(slot)).font(Theme.Font.mono(12)).foregroundStyle(conflict == slot ? Theme.danger : Theme.textSecondary)
                        TextButton(title: capturing == slot ? "Cancelar" : "Alterar", compact: true) {
                            if capturing == slot { finish(nil) } else { start(slot) }
                        }
                    }
                }
            }
        }
        .onDisappear { finish(nil) }
    }

    private func label(_ slot: Slot) -> String {
        if capturing == slot { return "Pressione o atalho…" }
        if conflict == slot { return "Já usado na outra ação" }
        return parseShortcut(settings[keyPath: slot.keyPath])?.display ?? "Nenhum"
    }

    private func start(_ slot: Slot) {
        finish(nil)
        noticeTask?.cancel()
        conflict = nil
        capturing = slot
        services.hotkeys.unregisterAll()
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            MainActor.assumeIsolated { handle(event) }
            return nil
        }
    }

    private func handle(_ event: NSEvent) {
        guard event.keyCode != 53 else { return finish(nil) }
        let flags = event.modifierFlags
        let captured = shortcutKey(forKeyCode: event.keyCode).flatMap {
            capturedShortcut(
                key: $0,
                control: flags.contains(.control),
                option: flags.contains(.option),
                shift: flags.contains(.shift),
                command: flags.contains(.command)
            )
        }
        finish(captured)
    }

    private func finish(_ captured: String?) {
        guard let slot = capturing else { return }
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        capturing = nil
        var value = settings[keyPath: slot.keyPath]
        if let captured {
            switch claimShortcut(captured, current: value, other: settings[keyPath: slot.other.keyPath]) {
            case .ok: value = captured
            case .same: break
            case .conflict: warn(slot)
            }
        }
        settings[keyPath: slot.keyPath] = value
    }

    private func warn(_ slot: Slot) {
        conflict = slot
        noticeTask = Task {
            try? await Task.sleep(for: .seconds(2))
            if !Task.isCancelled { conflict = nil }
        }
    }
}
