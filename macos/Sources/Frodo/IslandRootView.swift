import FrodoCore
import FrodoPlatform
import SwiftUI

private struct SizeKey: PreferenceKey {
    static let defaultValue = CGSize.zero

    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}

private extension View {
    @MainActor
    func reportSize(_ onChange: @escaping @MainActor (CGSize) -> Void) -> some View {
        background(GeometryReader { proxy in Color.clear.preference(key: SizeKey.self, value: proxy.size) })
            .onPreferenceChange(SizeKey.self) { size in MainActor.assumeIsolated { onChange(size) } }
    }
}

private struct IslandReveal: ViewModifier {
    let shown: Bool
    let blur: Bool
    let anchor: UnitPoint

    func body(content: Content) -> some View {
        content
            .blur(radius: shown || !blur ? 0 : Motion.openBlur)
            .scaleEffect(shown ? 1 : Motion.openScale, anchor: anchor)
            .opacity(shown ? 1 : 0)
    }
}

struct IslandRootView: View {
    let services: FrodoServices
    @Bindable var model: IslandModel
    var onToggle: () -> Void
    var onClose: () -> Void
    var onOpenTab: (TabId) -> Void = { _ in }

    @State private var contentHeight: CGFloat = 400
    @Environment(\.glassEnabled) private var glassEnabled

    var body: some View {
        let _ = services.revisions.settings
        let size = model.targetSize
        let radius = model.isOpen ? Theme.Radius.panel : min(min(size.width, size.height) / 2, model.position.isSideEdge ? 24 : 26)
        ZStack(alignment: model.position.alignment) {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Theme.island)
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(borderColor, lineWidth: model.activity.map(isUrgent) == true ? 1.5 : 1))
                .frame(width: size.width, height: size.height)
                .background { if glassEnabled, Surface.shared.style != .solid, !model.isHidden { GlassBackground(radius: radius) } }
                .shadow(color: .black.opacity((model.isOpen ? 0.5 : 0.35) * Theme.shadowStrength), radius: model.isOpen ? 30 : 10, y: model.isOpen ? 16 : 4)
                .opacity(model.isHidden ? 0 : 1)
                .animation(model.isHidden ? Motion.conceal : Motion.fadeIn, value: model.isHidden)
                .overlay(alignment: .top) { pillLayer }
                .overlay(alignment: .top) {
                    ZStack {
                        if model.isOpen {
                            islandLayer.transition(.modifier(active: reveal(shown: false), identity: reveal(shown: true)))
                        }
                    }
                    .allowsHitTesting(model.isOpen)
                    .animation(model.isOpen ? Motion.island : Motion.fadeOut, value: model.isOpen)
                }
                .animation(model.isOpen ? Motion.island : Motion.soft, value: size)
                .animation(Motion.standard, value: radius)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: model.position.alignment)
    }

    private var borderColor: Color {
        model.activity.map(isUrgent) == true ? Theme.amberBorder : Theme.islandBorder
    }

    private func isUrgent(_ activity: PillActivity) -> Bool {
        if case .claudePermission = activity { return true }
        return false
    }

    private var pillLayer: some View {
        ZStack {
            PillContent(services: services, activity: model.activity, peek: model.peek, vertical: model.position.isSideEdge, openTab: onOpenTab)
                .id(model.subjectToken)
                .reportSize { size in if size != .zero { model.pillSize = CGSize(width: size.width, height: max(Theme.Size.pillHeight, size.height)) } }
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: Motion.pillEnterScale)).animation(Motion.fadeIn),
                    removal: .opacity.combined(with: .scale(scale: Motion.pillExitScale)).animation(Motion.fadeOut)
                ))
        }
        .animation(Motion.standard, value: model.subjectToken)
        .frame(width: model.targetSize.width, height: model.targetSize.height)
        .opacity(model.isOpen || model.presence != .pill ? 0 : 1)
        .allowsHitTesting(!model.isOpen)
        .contentShape(Rectangle())
        .onTapGesture(perform: onToggle)
        .animation(model.isOpen ? Motion.fadeOut : Motion.pillReturn, value: model.isOpen)
    }

    private var islandLayer: some View {
        VStack(alignment: .leading, spacing: 10) {
            HeaderView(services: services, model: model, close: onClose)
            ScrollView(.vertical, showsIndicators: false) {
                ZStack(alignment: .top) {
                    Group {
                        if model.settingsOpen {
                            VStack(spacing: 10) { SettingsView(services: services, section: Bindable(model).settingsSection) { withAnimation(Motion.standard) { model.settingsOpen = false } } }
                        } else {
                            VStack(spacing: 10) { tabContent }
                        }
                    }
                    .id(model.settingsOpen ? "settings" : model.tab.rawValue)
                    .transition(.asymmetric(
                        insertion: .offset(x: model.slideDirection * Motion.swapOffset).combined(with: .opacity),
                        removal: .offset(x: -model.slideDirection * Motion.swapOffset).combined(with: .opacity)
                    ))
                }
                .frame(maxWidth: .infinity, alignment: .top)
                .reportSize { size in if size.height > 0, abs(contentHeight - size.height) > 0.5 { contentHeight = size.height } }
            }
            .frame(height: min(contentHeight, Theme.Size.maxIslandHeight - 20 - Theme.Size.headerHeight - 10))
            .animation(Motion.standard, value: contentHeight)
        }
        .padding(10)
        .frame(width: Theme.Size.islandWidth, alignment: .top)
        .onChange(of: contentHeight, initial: true) { _, height in model.islandHeight = height + Theme.Size.headerHeight + 30 }
        .overlay(alignment: .topTrailing) {
            if model.powerMenuOpen {
                ZStack(alignment: .topTrailing) {
                    Color.black.opacity(0.001).onTapGesture { withAnimation(Motion.standard) { model.powerMenuOpen = false } }
                    PowerMenu { withAnimation(Motion.standard) { model.powerMenuOpen = false } }
                        .padding(.top, 58).padding(.trailing, 16)
                        .transition(.opacity.combined(with: .scale(scale: 0.95, anchor: .topTrailing)))
                }
            }
        }
    }

    private func reveal(shown: Bool) -> IslandReveal {
        IslandReveal(shown: shown, blur: services.settings.openBlur, anchor: model.position.unitPoint)
    }

    @ViewBuilder
    private var tabContent: some View {
        switch model.tab {
        case .general: GeneralTab(services: services)
        case .calendar: CalendarTab(services: services)
        case .claude: AiTab(services: services)
        case .notifications: NotificationsTab(services: services)
        case .performance, .mixer: EmptyView()
        }
    }
}

extension IslandPosition {
    var alignment: Alignment {
        switch (vertical, horizontal) {
        case (.top, .leading): .topLeading
        case (.top, .center): .top
        case (.top, .trailing): .topTrailing
        case (.middle, .leading): .leading
        case (.middle, .center): .center
        case (.middle, .trailing): .trailing
        case (.bottom, .leading): .bottomLeading
        case (.bottom, .center): .bottom
        case (.bottom, .trailing): .bottomTrailing
        }
    }

    var unitPoint: UnitPoint {
        switch (vertical, horizontal) {
        case (.top, .leading): .topLeading
        case (.top, .center): .top
        case (.top, .trailing): .topTrailing
        case (.middle, .leading): .leading
        case (.middle, .center): .center
        case (.middle, .trailing): .trailing
        case (.bottom, .leading): .bottomLeading
        case (.bottom, .center): .bottom
        case (.bottom, .trailing): .bottomTrailing
        }
    }
}
