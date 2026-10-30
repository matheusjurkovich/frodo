import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

extension SettingsView {
    var generalSection: some View {
        Group {
            SettingsGroup("Comportamento") {
                ToggleRow(title: "Abrir ao passar o mouse", isOn: bind(\.openOnHover))
                ToggleRow(title: "Recolher sozinha após 5 s", subtitle: "Quando aberta por clique ou atalho", isOn: bind(\.autoClose))
                ToggleRow(
                    title: "Iniciar com o macOS",
                    isOn: Binding(get: { LoginItem.isEnabled }, set: { _ = LoginItem.setEnabled($0); services.revisions.settings += 1 })
                )
            }
            SettingsGroup("Atalhos", hint: "Formato: ctrl+opt+z. Evite ⌘⇧Z (é Refazer em quase todo app).") {
                shortcutRow("Abrir e fechar a ilha", \.toggleShortcut)
                shortcutRow("Abrir na aba Claude", \.claudeShortcut)
            }
        }
    }

    private func shortcutRow(_ title: String, _ keyPath: ReferenceWritableKeyPath<FrodoSettings, String>) -> some View {
        let parsed = parseShortcut(settings[keyPath: keyPath])
        return SettingRow(title) {
            HStack(spacing: 10) {
                Text(parsed?.display ?? "inválido").font(Theme.Font.label(.medium)).foregroundStyle(parsed == nil ? Theme.danger : Theme.textSecondary)
                TextField("ctrl+opt+z", text: bind(keyPath)).textFieldStyle(.roundedBorder).frame(width: 170).font(Theme.Font.mono(12))
            }
        }
    }

    var displaySection: some View {
        Group {
            SettingsGroup("Posição") {
                SettingRow(settings.position.label, subtitle: "Onde a ilha fica na tela") { PositionPicker(selection: bind(\.position)) }
            }
            SettingsGroup("Tela") {
                SettingRow("Monitores") {
                    SegmentedPicker(options: [(MonitorMode.primary, "Principal"), (.secondary, "Secundário"), (.both, "Ambos")], selection: bind(\.monitors))
                }
                SettingRow("Fundo", subtitle: "Fosco desfoca o que está atrás. Use Sólido se a abertura ficar pesada.") {
                    SegmentedPicker(options: [(SurfaceStyle.solid, "Sólido"), (.frosted, "Fosco"), (.clear, "Translúcido")], selection: bind(\.surfaceStyle))
                }
                ToggleRow(title: "Desfoque ao abrir", subtitle: "Desfoca o conteúdo durante a animação de abrir", isOn: bind(\.openBlur))
            }
        }
    }

    var pillSection: some View {
        SettingsGroup("Pílula fechada") {
            SettingBlock {
                VStack(alignment: .leading, spacing: 12) {
                    SegmentedPicker(options: [(ClosedMode.minimal, "Mínima"), (.compact, "Compacta"), (.rotating, "Rotativa")], selection: bind(\.closedMode))
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .leading), count: 2), alignment: .leading, spacing: 6) {
                        ForEach(ClosedItem.allCases, id: \.self) { item in
                            FrodoCheckbox(itemLabel(item), isOn: closedItemBinding(item)).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    if settings.closedMode == .rotating {
                        FrodoStepper("Trocar a cada \(settings.rotateSeconds) s", value: bind(\.rotateSeconds), range: 2 ... 30)
                    }
                }
            }
        }
    }

    private func closedItemBinding(_ item: ClosedItem) -> Binding<Bool> {
        Binding(
            get: { settings.closedItems.contains(item) },
            set: { on in
                var items = settings.closedItems
                if on, !items.contains(item) { items.append(item) } else if !on { items.removeAll { $0 == item } }
                settings.closedItems = ClosedItem.allCases.filter { items.contains($0) }
            }
        )
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

    var tabsSection: some View {
        let shown = visibleTabs(hidden: settings.hiddenTabs)
        return SettingsGroup("Abas visíveis") {
            ForEach(TabId.allCases, id: \.self) { tab in
                SettingRow(tab.label) {
                    FrodoSwitch(isOn: tabVisibilityBinding(tab)).disabled(shown == [tab])
                }
            }
        }
    }

    private func tabVisibilityBinding(_ tab: TabId) -> Binding<Bool> {
        Binding(
            get: { !settings.hiddenTabs.contains(tab) },
            set: { visible in
                var hidden = settings.hiddenTabs
                if visible { hidden.removeAll { $0 == tab } } else if !hidden.contains(tab) { hidden.append(tab) }
                settings.hiddenTabs = hidden
            }
        )
    }

    var aiSection: some View {
        Group {
            SettingsGroup("Uso") {
                SettingBlock { FrodoStepper("Atualizar a cada \(settings.claudePollMinutes) min", value: bind(\.claudePollMinutes), range: 1 ... 60) }
                ToggleRow(title: "Mostrar uso restante", subtitle: "Em vez do usado", isOn: bind(\.claudeShowRemaining))
            }
            SettingsGroup("Claude Code") {
                SettingBlock { profilesEditor }
                SettingBlock {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            StatusDot(color: services.sessions.hooksInstalled() ? Theme.ok : Theme.warn)
                            Text(services.sessions.hooksInstalled() ? "Hook do Claude Code ativo" : "Hook do Claude Code não encontrado")
                                .font(Theme.Font.secondary()).foregroundStyle(Theme.text)
                            Spacer()
                        }
                        HooksSetup(services: services)
                    }
                }
            }
        }
    }

    private var profilesEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
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

    var agendaSection: some View {
        let _ = services.revisions.calendar
        let granted = services.calendar.access == .granted
        return Group {
            SettingsGroup("Calendário") {
                SettingRow(granted ? "Calendário liberado" : "Calendário sem acesso", subtitle: "Lê os eventos do app Calendário do macOS") {
                    HStack(spacing: 10) {
                        StatusDot(color: granted ? Theme.ok : Theme.warn)
                        if !granted { TextButton(title: "Permitir", compact: true) { Task { await services.calendar.requestAccess() } } }
                    }
                }
                SettingRow("Contas de Internet", subtitle: "Adicione o Google Agenda ou outras contas ao macOS") {
                    TextButton(title: "Abrir", compact: true) { launchExternal { SystemActions.openSystemSettings(pane: "com.apple.Internet-Accounts-Settings.extension") } }
                }
            }
            SettingsGroup("Aviso", hint: "A reunião entra na pílula quando começa dentro desse prazo.") {
                SettingRow("Avisar na pílula antes da reunião") {
                    SegmentedPicker(options: [(0, "Não avisar"), (5, "5 min"), (10, "10 min"), (15, "15 min")], selection: bind(\.meetingNoticeMinutes))
                }
            }
        }
    }
}
