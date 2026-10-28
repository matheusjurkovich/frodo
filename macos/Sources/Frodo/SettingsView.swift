import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

struct SettingsView: View {
    let services: FrodoServices
    var back: () -> Void

    private var settings: FrodoSettings { services.settings }

    private func bind<Value>(_ keyPath: ReferenceWritableKeyPath<FrodoSettings, Value>) -> Binding<Value> {
        Binding(get: { settings[keyPath: keyPath] }, set: { settings[keyPath: keyPath] = $0 })
    }

    var body: some View {
        let _ = services.revisions.settings
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                IconButton(icon: "back", size: 32, iconSize: 14, help: "Voltar", action: back)
                Text("Configurações").font(Theme.Font.title()).foregroundStyle(Theme.text)
            }
            HStack(alignment: .top, spacing: 10) {
                VStack(spacing: 10) {
                    behaviorCard
                    pillCard
                    tabsCard
                }
                VStack(spacing: 10) {
                    claudeCard
                    shortcutsCard
                    integrationsCard
                }
            }
        }
    }

    private var behaviorCard: some View {
        CardView(title: "Comportamento") {
            ToggleRow(title: "Abrir ao passar o mouse", isOn: bind(\.openOnHover))
            ToggleRow(title: "Recolher sozinha após 5 s", isOn: bind(\.autoClose))
            ToggleRow(
                title: "Iniciar com o macOS",
                isOn: Binding(get: { LoginItem.isEnabled }, set: { _ = LoginItem.setEnabled($0); services.revisions.settings += 1 })
            )
            HStack {
                Text("Monitores").font(Theme.Font.body()).foregroundStyle(Theme.text)
                Spacer()
                SegmentedPicker(options: [(MonitorMode.primary, "Principal"), (.secondary, "Secundário"), (.both, "Ambos")], selection: bind(\.monitors))
            }
        }
    }

    private var pillCard: some View {
        CardView(title: "Pílula fechada") {
            SegmentedPicker(options: [(ClosedMode.minimal, "Mínima"), (.compact, "Compacta"), (.rotating, "Rotativa")], selection: bind(\.closedMode))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .leading), count: 2), alignment: .leading, spacing: 6) {
                ForEach(ClosedItem.allCases, id: \.self) { item in
                    Toggle(
                        itemLabel(item),
                        isOn: Binding(
                            get: { settings.closedItems.contains(item) },
                            set: { on in
                                var items = settings.closedItems
                                if on, !items.contains(item) { items.append(item) } else if !on { items.removeAll { $0 == item } }
                                settings.closedItems = ClosedItem.allCases.filter { items.contains($0) }
                            }
                        )
                    )
                    .toggleStyle(.checkbox).font(Theme.Font.secondary()).foregroundStyle(Theme.text).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if settings.closedMode == .rotating {
                Stepper("Trocar a cada \(settings.rotateSeconds) s", value: bind(\.rotateSeconds), in: 2 ... 30).font(Theme.Font.secondary()).foregroundStyle(Theme.text)
            }
        }
    }

    private func itemLabel(_ item: ClosedItem) -> String {
        switch item {
        case .clock: "Hora"
        case .date: "Data"
        case .notifications: "Notificações"
        case .battery: "Bateria"
        case .ram: "Memória"
        case .claudeSession: "Claude (5 h)"
        case .claudeWeekly: "Claude (semana)"
        }
    }

    private var tabsCard: some View {
        CardView(title: "Abas visíveis") {
            ForEach(TabId.allCases, id: \.self) { tab in
                Toggle(
                    tab.label,
                    isOn: Binding(
                        get: { !settings.hiddenTabs.contains(tab) },
                        set: { visible in
                            var hidden = settings.hiddenTabs
                            if visible { hidden.removeAll { $0 == tab } } else if !hidden.contains(tab) { hidden.append(tab) }
                            settings.hiddenTabs = hidden
                        }
                    )
                )
                .toggleStyle(.checkbox).font(Theme.Font.secondary()).foregroundStyle(Theme.text)
            }
        }
    }

    private var claudeCard: some View {
        CardView(title: "Claude") {
            Stepper("Atualizar a cada \(settings.claudePollMinutes) min", value: bind(\.claudePollMinutes), in: 1 ... 60).font(Theme.Font.secondary()).foregroundStyle(Theme.text)
            ToggleRow(title: "Mostrar o que resta", subtitle: "Em vez do que já foi usado", isOn: bind(\.claudeShowRemaining))
            Text("Perfis").font(Theme.Font.label(.medium)).foregroundStyle(Theme.textSecondary)
            ForEach(settings.claudeProfiles, id: \.id) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(item.label).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text)
                        Text(item.configDir.replacingOccurrences(of: NSHomeDirectory(), with: "~")).font(Theme.Font.mono(11)).foregroundStyle(Theme.textSecondary)
                    }
                    Spacer()
                    IconButton(icon: "minus", size: 26, iconSize: 10) { settings.claudeProfiles = settings.claudeProfiles.filter { $0.id != item.id } }
                }
            }
            TextButton(title: "Adicionar perfil…", compact: true, action: addProfile)
        }
    }

    private func addProfile() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.showsHiddenFiles = true
        panel.directoryURL = URL(fileURLWithPath: NSHomeDirectory())
        panel.prompt = "Escolher"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        settings.claudeProfiles = settings.claudeProfiles + [profile(for: url.path)]
    }

    private var shortcutsCard: some View {
        CardView(title: "Atalhos") {
            shortcutField("Abrir e fechar a ilha", \.toggleShortcut)
            shortcutField("Abrir na aba Claude", \.claudeShortcut)
            Text("Formato: ctrl+opt+z. Evite ⌘⇧Z (é Refazer em quase todo app).").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
        }
    }

    private func shortcutField(_ title: String, _ keyPath: ReferenceWritableKeyPath<FrodoSettings, String>) -> some View {
        let valid = parseShortcut(settings[keyPath: keyPath]) != nil
        return HStack {
            Text(title).font(Theme.Font.secondary()).foregroundStyle(Theme.text)
            Spacer()
            TextField("ctrl+opt+z", text: bind(keyPath)).textFieldStyle(.roundedBorder).frame(width: 150).font(Theme.Font.mono(12))
            Text(parseShortcut(settings[keyPath: keyPath])?.display ?? "inválido").font(Theme.Font.label(.medium))
                .foregroundStyle(valid ? Theme.textSecondary : Theme.danger).frame(width: 60, alignment: .leading)
        }
    }

    private var integrationsCard: some View {
        CardView(title: "Integrações") {
            HStack {
                StatusDot(color: services.sessions.hooksInstalled() ? Theme.ok : Theme.warn)
                Text(services.sessions.hooksInstalled() ? "Hook do Claude Code ativo" : "Hook do Claude Code não encontrado").font(Theme.Font.secondary()).foregroundStyle(Theme.text)
                Spacer()
            }
            HooksSetup(services: services)
            HStack {
                StatusDot(color: services.calendar.access == .granted ? Theme.ok : Theme.warn)
                Text(services.calendar.access == .granted ? "Calendário liberado" : "Calendário sem acesso").font(Theme.Font.secondary()).foregroundStyle(Theme.text)
                Spacer()
                if services.calendar.access != .granted {
                    TextButton(title: "Permitir", compact: true) { Task { await services.calendar.requestAccess() } }
                }
            }
        }
    }
}
