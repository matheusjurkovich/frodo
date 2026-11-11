import AppKit
import FrodoCore
import SwiftUI

struct SettingBlock<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.divider).frame(height: 1).padding(.horizontal, 14) }
    }
}

struct SettingRow<Control: View>: View {
    let title: String
    var subtitle: String?
    let control: Control

    init(_ title: String, subtitle: String? = nil, @ViewBuilder control: () -> Control) {
        self.title = title
        self.subtitle = subtitle
        self.control = control()
    }

    var body: some View {
        SettingBlock {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Theme.Font.body()).foregroundStyle(Theme.text)
                    if let subtitle { Text(subtitle).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).fixedSize(horizontal: false, vertical: true) }
                }
                Spacer(minLength: 12)
                control
            }
            .frame(minHeight: 32)
        }
    }
}

struct SettingsGroup<Content: View>: View {
    let title: String
    var hint: String?
    let content: Content

    init(_ title: String, hint: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.hint = hint
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(Theme.Font.label(.medium)).foregroundStyle(Theme.textSecondary).padding(.leading, 4)
            VStack(alignment: .leading, spacing: 0) { content }
                .padding(.bottom, -1)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
                .background(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).fill(Theme.card))
            if let hint { Text(hint).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).padding(.horizontal, 4) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SettingsSidebar: View {
    @Binding var selection: SettingsSection

    var body: some View {
        VStack(spacing: 2) {
            ForEach(SettingsSection.allCases) { section in
                Button {
                    withAnimation(Motion.standard) { selection = section }
                } label: {
                    HStack(spacing: 10) {
                        FrodoIcon(name: section.icon.name, size: 16, color: selection == section ? Theme.text : Theme.textSecondary, system: section.icon.system)
                        Text(section.label).font(Theme.Font.body(.medium)).foregroundStyle(selection == section ? Theme.text : Theme.textSecondary)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 40)
                    .hoverBackground(selection == section ? Theme.controlHover : .clear, hover: Theme.controlHover)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(6)
        .frame(width: 190)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).fill(Theme.card))
    }
}

struct HooksSetup: View {
    let services: FrodoServices
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("O Frodo ainda não recebe eventos do Claude Code. Instale o hook e cole o bloco no settings.json de cada perfil.")
                .font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            HStack {
                TextButton(title: "Instalar hook e copiar bloco", kind: .primary, compact: true) {
                    if let path = services.installHookIfPossible() {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(hookSettingsJSON(scriptPath: path), forType: .string)
                        message = "Hook em \(path). Bloco copiado: mescle em ~/.claude/settings.json."
                    } else {
                        message = "Não achei o script do hook."
                    }
                }
            }
            if let message { Text(message).font(Theme.Font.label()).foregroundStyle(Theme.accentText) }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.item, style: .continuous).fill(Theme.control))
    }
}
