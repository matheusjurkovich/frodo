import FrodoCore
import FrodoPlatform
import SwiftUI

struct HeaderView: View {
    let services: FrodoServices
    @Bindable var model: IslandModel
    var close: () -> Void
    @Namespace private var markerSpace

    private var visible: [TabId] {
        visibleTabs(hidden: services.settings.hiddenTabs)
    }

    var body: some View {
        let _ = services.revisions.settings + services.revisions.notifications
        HStack(spacing: 12) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                HStack(spacing: 8) {
                    Text(context.date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))).font(Theme.Font.title()).foregroundStyle(Theme.text).monospacedDigit()
                    Text(formatDate(context.date)).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
                }
            }
            .frame(width: 170, alignment: .leading)
            Spacer(minLength: 0)
            HStack(spacing: 4) {
                ForEach(visible, id: \.self) { tab in
                    tabButton(tab)
                }
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                IconButton(icon: "gear", help: "Configurações") {
                    withAnimation(Motion.standard) {
                        model.slideDirection = 1
                        model.settingsOpen.toggle()
                    }
                }
                IconButton(icon: "power", tint: Theme.danger, help: "Energia") {
                    withAnimation(Motion.standard) { model.powerMenuOpen.toggle() }
                }
                IconButton(icon: "collapse", help: "Recolher", action: close)
            }
            .frame(width: 170, alignment: .trailing)
        }
        .frame(height: Theme.Size.headerHeight)
    }

    private func tabButton(_ tab: TabId) -> some View {
        let selected = model.tab == tab && !model.settingsOpen
        return Button {
            withAnimation(Motion.standard) { model.select(tab, visible: visible) }
        } label: {
            HStack(spacing: 6) {
                FrodoIcon(name: icon(for: tab), size: 15, color: selected ? Theme.text : Theme.textSecondary)
                Text(tab.label).font(Theme.Font.secondary(.medium)).foregroundStyle(selected ? Theme.text : Theme.textSecondary)
                if tab == .notifications, services.notifications.count > 0 {
                    Text("\(services.notifications.count)").font(Theme.Font.label(.semibold)).foregroundStyle(.white)
                        .padding(.horizontal, 6).frame(minWidth: 18, minHeight: 18).background(Capsule().fill(Theme.accent))
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background {
                if selected { Capsule().fill(Theme.controlHover).matchedGeometryEffect(id: "marker", in: markerSpace) }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func icon(for tab: TabId) -> String {
        switch tab {
        case .general: "general"
        case .calendar: "calendar"
        case .claude: "claude"
        case .notifications: "bell"
        }
    }
}

struct PowerMenu: View {
    var dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            item("Suspender", icon: "suspend") { SystemActions.sleep() }
            item("Encerrar sessão", icon: "logout") { SystemActions.logOut() }
            item("Reiniciar", icon: "restart") { SystemActions.restart() }
            item("Desligar", icon: "power", tint: Theme.danger) { SystemActions.shutDown() }
            Text("Programas abertos serão fechados ao reiniciar ou desligar.")
                .font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).padding(.horizontal, 10).padding(.top, 4)
        }
        .padding(8)
        .frame(width: 232)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).fill(Theme.card))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).stroke(Theme.islandBorder))
        .shadow(color: .black.opacity(0.4), radius: 20, y: 8)
    }

    private func item(_ title: String, icon: String, tint: Color = Theme.text, action: @escaping () -> Void) -> some View {
        Button {
            dismiss()
            action()
        } label: {
            HStack(spacing: 10) {
                FrodoIcon(name: icon, size: 16, color: tint)
                Text(title).font(Theme.Font.body()).foregroundStyle(tint)
                Spacer()
            }
            .padding(.horizontal, 10)
            .frame(height: 36)
            .hoverBackground(.clear, hover: Theme.controlHover, radius: 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct CollapsibleCard<Content: View>: View {
    let services: FrodoServices
    let id: CardId
    let title: String
    @ViewBuilder var content: Content

    private var collapsed: Bool {
        services.settings.collapsedCards.contains(id)
    }

    var body: some View {
        let _ = services.revisions.settings
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(Motion.standard) {
                    var cards = services.settings.collapsedCards
                    if let index = cards.firstIndex(of: id) { cards.remove(at: index) } else { cards.append(id) }
                    services.settings.collapsedCards = cards
                }
            } label: {
                HStack {
                    Text(title).font(Theme.Font.title()).foregroundStyle(Theme.text)
                    Spacer()
                    FrodoIcon(name: "collapse", size: 14, color: Theme.textSecondary).rotationEffect(.degrees(collapsed ? 180 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if !collapsed {
                content.transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous).fill(Theme.card))
        .clipped()
    }
}
