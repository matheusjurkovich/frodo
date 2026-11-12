import FrodoCore
import FrodoPlatform
import SwiftUI

struct HeaderView: View {
    let services: FrodoServices
    @Bindable var model: IslandModel
    var close: () -> Void
    @Namespace private var markerSpace

    private var visible: [TabId] {
        visibleTabs(hidden: services.settings.hiddenTabs, order: services.settings.tabOrder)
    }

    var body: some View {
        let _ = services.revisions.settings + services.revisions.notifications
        HStack(spacing: 12) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                HStack(spacing: 8) {
                    Text(formatClock(context.date, seconds: services.settings.showSeconds)).font(Theme.Font.title()).foregroundStyle(Theme.text).monospacedDigit()
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
        case .performance: "performance"
        case .mixer: "volume"
        }
    }
}

struct PowerMenu: View {
    var dismiss: () -> Void

    var body: some View {
        let power = SystemActions.powerAvailability()
        return VStack(alignment: .leading, spacing: 4) {
            if power.canSleep { item("Suspender", icon: "suspend") { SystemActions.sleep() } }
            if power.canLogOut { item("Encerrar sessão", icon: "logout") { SystemActions.logOut() } }
            if power.canRestart { item("Reiniciar", icon: "restart") { SystemActions.restart() } }
            if power.canShutDown { item("Desligar", icon: "power", tint: Theme.danger) { SystemActions.shutDown() } }
            if power.canLogOut || power.canRestart || power.canShutDown {
                Text("Programas abertos serão fechados ao encerrar a sessão, reiniciar ou desligar.")
                    .font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).padding(.horizontal, 10).padding(.top, 4)
            }
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

struct CollapsibleCard<Content: View, Summary: View>: View {
    let services: FrodoServices
    let id: CardId
    let title: String
    let count: Int?
    let content: Content
    let summary: Summary

    init(
        services: FrodoServices, id: CardId, title: String, count: Int? = nil, @ViewBuilder content: () -> Content,
        @ViewBuilder summary: () -> Summary
    ) {
        self.services = services
        self.id = id
        self.title = title
        self.count = count
        self.content = content()
        self.summary = summary()
    }

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
                HStack(spacing: 10) {
                    Text(title).font(Theme.Font.title()).foregroundStyle(Theme.text)
                    if collapsed { summary.transition(.opacity) }
                    Spacer()
                    if let count { Text("\(count)").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.textSecondary).monospacedDigit() }
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

extension CollapsibleCard where Summary == EmptyView {
    init(services: FrodoServices, id: CardId, title: String, @ViewBuilder content: () -> Content) {
        self.init(services: services, id: id, title: title, content: content, summary: { EmptyView() })
    }
}
