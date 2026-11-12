import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

extension SettingsView {
    var aiSection: some View {
        Group {
            SettingsGroup("Uso") {
                SettingBlock { FrodoStepper("Atualizar uso a cada \(settings.claudePollMinutes) min", value: bind(\.claudePollMinutes), range: 1 ... 60) }
                ToggleRow(title: "Avisar quando terminar", subtitle: "Notificação quando Claude, Codex ou Gemini termina a resposta", isOn: bind(\.notifyDone))
                ToggleRow(title: "Avisar cota em 80% e 95%", subtitle: "E quando a cota renova", isOn: bind(\.notifyQuota))
                ToggleRow(title: "Mostrar uso restante em vez do usado", isOn: bind(\.claudeShowRemaining))
            }
            SettingsGroup("Claude Code") {
                followRow(.claude, "Acompanhar o Claude Code", "Cotas pela conta, sessões pelo hook em ~/.claude/settings.json")
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
            SettingsGroup("Codex") {
                followRow(.codex, "Acompanhar o Codex", "Cotas e consumo lidos de ~/.codex/sessions")
                AgentHookRow(
                    services: services, agent: .codex, title: "Sessões e permissões", subtitle: "Mostra o status e deixa aprovar ou negar pedidos pela ilha"
                )
            }
            SettingsGroup("Gemini CLI") {
                followRow(.gemini, "Acompanhar o Gemini CLI", "Tokens e sessões lidos de ~/.gemini/tmp")
                SettingRow("Limite diário de pedidos", subtitle: "O Gemini CLI não informa a cota; a ilha conta os pedidos do dia") {
                    SegmentedPicker(options: [(1000, "1.000"), (1500, "1.500"), (2000, "2.000")], selection: bind(\.geminiDailyLimit))
                }
                AgentHookRow(
                    services: services, agent: .gemini, title: "Status das sessões",
                    subtitle: "O Gemini CLI não deixa responder pedidos por hook: a ilha avisa e abre o terminal"
                )
            }
        }
    }

    private func followRow(_ provider: AiProvider, _ title: String, _ subtitle: String) -> some View {
        SettingBlock {
            HStack(spacing: 12) {
                ProviderTile(provider: provider, size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text)
                    Text(subtitle).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 12)
                FrodoSwitch(isOn: followBinding(provider))
            }
            .frame(minHeight: 32)
        }
    }

    private func followBinding(_ provider: AiProvider) -> Binding<Bool> {
        Binding(
            get: { settings.providerEnabled(provider) },
            set: { enabled in settings.disabledAi = settings.disabledAi.filter { $0 != provider } + (enabled ? [] : [provider]) }
        )
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
}

private struct AgentHookRow: View {
    let services: FrodoServices
    let agent: HookedAgent
    let title: String
    let subtitle: String
    @State private var installed = false
    @State private var status: String?

    var body: some View {
        SettingRow(title, subtitle: [subtitle, status].compactMap { $0 }.joined(separator: "\n")) {
            TextButton(title: installed ? "Instalado" : "Instalar hook", compact: true) { install() }.disabled(installed)
        }
        .onAppear { refresh() }
    }

    private func install() {
        if case let .failure(error) = services.agentHooks.install(agent) { status = error.message }
        refresh()
    }

    private func refresh() {
        installed = services.agentHooks.installed(agent)
        if installed {
            status = "Hook em \(services.agentHooks.displayPath(agent)). Reinicie o \(agent == .codex ? "Codex" : "Gemini CLI") para valer."
        }
    }
}
