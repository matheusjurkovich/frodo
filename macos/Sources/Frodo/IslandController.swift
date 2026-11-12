import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

@MainActor
enum IslandBus {
    private static var closers: [ObjectIdentifier: () -> Void] = [:]

    static func register(_ owner: AnyObject, close: @escaping () -> Void) {
        closers[ObjectIdentifier(owner)] = close
    }

    static func unregister(_ owner: AnyObject) {
        closers[ObjectIdentifier(owner)] = nil
    }

    static func closeAll() {
        for close in closers.values { close() }
    }
}

@MainActor
func launchExternal(_ action: () -> Void) {
    action()
    IslandBus.closeAll()
}

@MainActor
final class IslandController: NSObject {
    let screen: NSScreen
    let services: FrodoServices
    let model = IslandModel()
    let panel = FrodoPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)

    private let coverMonitor: ScreenCoverMonitor
    private let hover: HoverIntent
    private var host: ShapeHostingView<IslandRootView>?
    private var hoverGrace = HoverGrace()
    private var disposables = Disposables()
    private var activationObserver: NSObjectProtocol?
    private var cover = ScreenCover.none
    private var peekCycle: PeekCycle?

    init(screen: NSScreen, services: FrodoServices, coverMonitor: ScreenCoverMonitor) {
        self.screen = screen
        self.services = services
        self.coverMonitor = coverMonitor
        hover = HoverIntent(
            scheduler: services.scheduler, openDelay: Motion.openDelay, closeDelay: Motion.closeDelay, autoCloseDelay: Motion.autoCloseSeconds,
            pollInterval: Motion.hoverPoll
        )
        super.init()
        configurePanel()
        let root = IslandRootView(
            services: services, model: model, onToggle: { [weak self] in self?.togglePill() }, onClose: { [weak self] in self?.close() },
            onOpenTab: { [weak self] tab in self?.open(tab: tab) }
        )
        let hosting = ShapeHostingView(rootView: root)
        hosting.shapeSize = { [weak self] in
            guard let self else { return .zero }
            if self.model.isHidden { return .zero }
            let size = self.model.targetSize
            guard self.model.showsTongue else { return size }
            return self.model.position.isSideEdge ? CGSize(width: size.width + 8, height: size.height) : CGSize(width: size.width, height: size.height + 8)
        }
        hosting.position = { [weak self] in self?.model.position ?? .topCenter }
        hosting.onPointer = { [weak self] in self?.updateHover() }
        panel.contentView = hosting
        host = hosting
        model.position = services.settings.position
        place()
        panel.orderFrontRegardless()
        model.updateActivity(services.feed.current)
        disposables.add(services.feed.changed.on { [weak self] _ in self?.syncActivity() })
        disposables.add(services.settings.onChanged(["position"]) { [weak self] in self?.applyPosition() })
        disposables.add(services.settings.onChanged(["hidden-tabs", "tab-order"]) { [weak self] in self?.syncTabs() })
        disposables.add(services.settings.onChanged(["always-show-pill", "peek-clock", "peek-every-minutes", "peek-seconds"]) { [weak self] in self?.syncCover() })
        peekCycle = PeekCycle(
            scheduler: services.scheduler,
            canStart: { [weak self] in self?.canPeek() ?? false },
            onChange: { [weak self] state in self?.applyPeek(state) }
        )
        refreshCover()
        disposables.add(coverMonitor.changed.on { [weak self] _ in self?.refreshCover() })
        IslandBus.register(self) { [weak self] in self?.close() }
        activationObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            let activated = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            guard activated?.processIdentifier != ProcessInfo.processInfo.processIdentifier else { return }
            MainActor.assumeIsolated { self?.close() }
        }
    }

    private func configurePanel() {
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isMovable = false
        panel.acceptsMouseMovedEvents = true
    }

    func place() {
        let visible = screen.visibleFrame
        let cap = min(Theme.Size.maxIslandHeight, visible.height - 40)
        model.panelHeight = cap + Theme.Size.panelPadding
        let frame = islandPanelFrame(
            position: model.position, visible: visible, islandSize: CGSize(width: Theme.Size.islandWidth, height: cap),
            padding: Theme.Size.panelPadding, margin: Theme.Size.topMargin
        )
        panel.setFrame(frame, display: true)
        host?.updateTrackingAreas()
    }

    private func syncTabs() {
        model.tab = tabToOpen(model.tab, visible: visibleTabs(hidden: services.settings.hiddenTabs, order: services.settings.tabOrder))
    }

    private func applyPosition() {
        close()
        model.position = services.settings.position
        place()
    }

    private func shapeRect(open: Bool) -> NSRect {
        let size: CGSize
        if open {
            size = CGSize(width: Theme.Size.islandWidth, height: min(model.islandHeight, Theme.Size.maxIslandHeight))
        } else if model.isHidden {
            size = .zero
        } else if model.showsTongue {
            size = model.position.isSideEdge ? CGSize(width: 16, height: 144) : CGSize(width: 144, height: 16)
        } else {
            size = model.pillSize
        }
        return islandShapeRect(position: model.position, panel: panel.frame, size: size)
    }

    private func pointerIsOverOpenIsland() -> Bool {
        hoverGrace.isOverIsland(pointer: NSEvent.mouseLocation, shape: shapeRect(open: true))
    }

    func updateHover() {
        let inside = model.isOpen ? model.dragging || pointerIsOverOpenIsland() : shapeRect(open: false).contains(NSEvent.mouseLocation)
        if inside {
            hover.entered(canOpen: !model.isOpen && services.settings.openOnHover && !model.pillHasAction) { [weak self] in
                guard let self, self.shapeRect(open: false).contains(NSEvent.mouseLocation), !self.model.pillHasAction else { return }
                self.open(tab: self.model.activity?.clickTab)
            }
        } else {
            hover.left(canClose: model.isOpen && services.settings.openOnHover) { [weak self] in
                guard let self, !self.model.dragging, !self.pointerIsOverOpenIsland() else { return }
                self.close()
            }
        }
    }

    func toggle() {
        model.isOpen ? close() : open()
    }

    func togglePill() {
        model.isOpen ? close() : open(tab: model.activity?.clickTab)
    }

    func open(tab: TabId? = nil) {
        if tab != nil || !model.isOpen {
            let visible = visibleTabs(hidden: services.settings.hiddenTabs, order: services.settings.tabOrder)
            model.select(tabToOpen(tab, visible: visible), visible: visible)
        }
        guard !model.isOpen else { return }
        services.feed.cancelTransient()
        panel.allowsKey = true
        withAnimation(Motion.island) { model.isOpen = true }
        var autoClose: (@MainActor () -> Void)?
        if services.settings.autoClose {
            autoClose = { [weak self] in
                guard let self, self.model.isOpen, !self.model.dragging, !self.pointerIsOverOpenIsland() else { return }
                self.close()
            }
        }
        hover.opened(poll: { [weak self] in self?.updateHover() }, autoClose: autoClose)
    }

    func close() {
        guard model.isOpen else { return }
        hover.closed()
        hoverGrace.reset()
        panel.allowsKey = false
        model.dragging = false
        withAnimation(Motion.soft) {
            model.isOpen = false
            model.powerMenuOpen = false
        }
    }

    private func syncActivity() {
        withAnimation(Motion.standard) {
            model.updateActivity(services.feed.current)
            model.presence = currentPresence()
        }
    }

    private func currentPresence() -> PillPresence {
        pillPresence(cover: cover, alwaysShow: services.settings.alwaysShowPill, activity: model.activity?.kind, peeking: model.peek != nil)
    }

    private func canPeek() -> Bool {
        let withoutPeek = pillPresence(cover: cover, alwaysShow: services.settings.alwaysShowPill, activity: model.activity?.kind, peeking: false)
        return !model.isOpen && withoutPeek != .pill
    }

    private func applyPeek(_ state: PeekState?) {
        withAnimation(Motion.standard) {
            model.updatePeek(state)
            model.presence = currentPresence()
        }
    }

    private func syncCover() {
        let settings = services.settings
        peekCycle?.update(active: cover == .fullscreen && settings.peekClock, everyMinutes: settings.peekEveryMinutes, seconds: settings.peekSeconds)
        let next = currentPresence()
        if next != model.presence { withAnimation(Motion.standard) { model.presence = next } }
    }

    private func refreshCover() {
        let next = coverMonitor.cover(of: screen)
        guard next != cover else { return }
        let alwaysShow = services.settings.alwaysShowPill
        let wasCovered = pillCovered(cover, alwaysShow: alwaysShow)
        cover = next
        if pillCovered(next, alwaysShow: alwaysShow), !wasCovered {
            services.feed.cancelTransient()
            close()
        }
        syncCover()
    }

    func tearDown() {
        hover.stop()
        peekCycle?.stop()
        disposables.dispose()
        IslandBus.unregister(self)
        if let activationObserver { NSWorkspace.shared.notificationCenter.removeObserver(activationObserver) }
        panel.orderOut(nil)
    }
}
