import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

struct SettingsView: View {
    let services: FrodoServices
    @Binding var section: SettingsSection
    var back: () -> Void

    var settings: FrodoSettings { services.settings }

    func bind<Value>(_ keyPath: ReferenceWritableKeyPath<FrodoSettings, Value>) -> Binding<Value> {
        Binding(get: { settings[keyPath: keyPath] }, set: { settings[keyPath: keyPath] = $0 })
    }

    var body: some View {
        let _ = services.revisions.settings
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                IconButton(icon: "back", size: 32, iconSize: 14, help: "Voltar", action: back)
                Text("Configurações").font(Theme.Font.title()).foregroundStyle(Theme.text)
            }
            HStack(alignment: .top, spacing: 12) {
                SettingsSidebar(selection: $section)
                VStack(alignment: .leading, spacing: 14) { sectionContent }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .id(section)
            }
        }
    }

    @ViewBuilder
    private var sectionContent: some View {
        switch section {
        case .general: generalSection
        case .display: displaySection
        case .pill: pillSection
        case .tabs: tabsSection
        case .ai: aiSection
        case .agenda: agendaSection
        }
    }
}
