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
    func reportSize(_ onChange: @escaping (CGSize) -> Void) -> some View {
        background(GeometryReader { proxy in Color.clear.preference(key: SizeKey.self, value: proxy.size) })
            .onPreferenceChange(SizeKey.self, perform: onChange)
    }
}

struct IslandRootView: View {
    let services: FrodoServices
    @Bindable var model: IslandModel
    var onToggle: () -> Void
    var onClose: () -> Void

    @State private var contentHeight: CGFloat = 400

    private var visible: [TabId] { visibleTabs(hidden: services.settings.hiddenTabs) }

    var body: some View {
        let _ = services.revisions.settings
        let size = model.targetSize
        let radius = model.isOpen ? Theme.Radius.panel : min(size.height / 2, 26)
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Theme.island)
                .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(borderColor, lineWidth: model.activity.map(isUrgent) == true ? 1.5 : 1))
                .frame(width: size.width, height: size.height)
                .shadow(color: .black.opacity(model.isOpen ? 0.5 : 0.35), radius: model.isOpen ? 30 : 10, y: model.isOpen ? 16 : 4)
                .overlay(alignment: .top) { pillLayer }
                .overlay(alignment: .top) { islandLayer }
                .animation(model.isOpen ? Motion.island : Motion.standard, value: size)
                .animation(Motion.standard, value: radius)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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
            PillContent(services: services, activity: model.activity)
                .id(model.subjectToken)
                .reportSize { size in if size != .zero { model.pillSize = CGSize(width: size.width, height: max(Theme.Size.pillHeight, size.height)) } }
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: Motion.pillEnterScale)).animation(Motion.fadeIn),
                    removal: .opacity.combined(with: .scale(scale: Motion.pillExitScale)).animation(Motion.fadeOut)
                ))
        }
        .animation(Motion.standard, value: model.subjectToken)
        .frame(width: model.targetSize.width, height: model.targetSize.height)
        .opacity(model.isOpen || model.showsTongue ? 0 : 1)
        .allowsHitTesting(!model.isOpen)
        .contentShape(Rectangle())
        .onTapGesture(perform: onToggle)
        .animation(model.isOpen ? Motion.fadeOut : Motion.fadeIn, value: model.isOpen)
    }

    private var islandLayer: some View {
        VStack(alignment: .leading, spacing: 10) {
            HeaderView(services: services, model: model, close: onClose)
            ScrollView(.vertical, showsIndicators: false) {
                ZStack(alignment: .top) {
                    Group {
                        if model.settingsOpen {
                            VStack(spacing: 10) { SettingsView(services: services) { withAnimation(Motion.standard) { model.settingsOpen = false } } }
                        } else {
                            VStack(spacing: 10) { tabContent }
                        }
                    }
                    .id(model.settingsOpen ? "settings" : model.tab.rawValue)
                    .transition(.asymmetric(
                        insertion: .offset(x: model.slideDirection * Motion.slideDistance).combined(with: .opacity),
                        removal: .offset(x: -model.slideDirection * Motion.slideDistance).combined(with: .opacity)
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
        .blur(radius: model.isOpen ? 0 : Motion.openBlur)
        .scaleEffect(model.isOpen ? 1 : Motion.openScale, anchor: .top)
        .opacity(model.isOpen ? 1 : 0)
        .allowsHitTesting(model.isOpen)
        .animation(model.isOpen ? Motion.island : Motion.fadeOut, value: model.isOpen)
    }

    @ViewBuilder
    private var tabContent: some View {
        switch model.tab {
        case .general: GeneralTab(services: services)
        case .calendar: CalendarTab(services: services)
        case .claude: ClaudeTab(services: services)
        case .notifications: NotificationsTab(services: services)
        }
    }
}
