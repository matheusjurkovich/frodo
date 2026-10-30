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

    private var host: ShapeHostingView<IslandRootView>?
    private var openWork: DispatchWorkItem?
    private var closeWork: DispatchWorkItem?
    private var autoCloseWork: DispatchWorkItem?
    private var hoverGrace = HoverGrace()
    private var pollTimer: Timer?
    private var coverTimer: Timer?
    private var disposables = Disposables()
    private var activationObserver: NSObjectProtocol?
    private var spaceObserver: NSObjectProtocol?
    private var cover = ScreenCover.none
    private var peekCycle: PeekCycle?

    init(screen: NSScreen, services: FrodoServices) {
        self.screen = screen
        self.services = services
        super.init()
        configurePanel()
        let root = IslandRootView(services: services, model: model, onToggle: { [weak self] in self?.togglePill() }, onClose: { [weak self] in self?.close() })
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
        disposables.add(services.settings.onChanged(["always-show-pill", "peek-clock", "peek-every-minutes", "peek-seconds"]) { [weak self] in self?.syncCover() })
        peekCycle = PeekCycle(
            scheduler: SystemScheduler(),
            canStart: { [weak self] in self?.canPeek() ?? false },
            onChange: { [weak self] state in self?.applyPeek(state) }
        )
        refreshCover()
        coverTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refreshCover() }
        }
        RunLoop.main.add(coverTimer!, forMode: .common)
        IslandBus.register(self) { [weak self] in self?.close() }
        activationObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            let activated = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            guard activated?.processIdentifier != ProcessInfo.processInfo.processIdentifier else { return }
            MainActor.assumeIsolated { self?.close() }
        }
        spaceObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.activeSpaceDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.refreshCover() }
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
        let mouse = NSEvent.mouseLocation
        let inside = model.isOpen ? pointerIsOverOpenIsland() : shapeRect(open: false).contains(mouse)
        if inside {
            closeWork?.cancel()
            closeWork = nil
            if !model.isOpen, openWork == nil, services.settings.openOnHover, !model.pillHasAction {
                let work = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    self.openWork = nil
                    if self.shapeRect(open: false).contains(NSEvent.mouseLocation), !self.model.pillHasAction {
                        self.open(tab: self.model.activity?.clickTab)
                    }
                }
                openWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + Motion.openDelay, execute: work)
            }
        } else {
            openWork?.cancel()
            openWork = nil
            if model.isOpen, closeWork == nil, services.settings.openOnHover {
                let work = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    self.closeWork = nil
                    if !self.pointerIsOverOpenIsland() { self.close() }
                }
                closeWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + Motion.closeDelay, execute: work)
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
        if let tab {
            let visible = visibleTabs(hidden: services.settings.hiddenTabs)
            model.select(tabToOpen(tab, visible: visible), visible: visible)
        }
        guard !model.isOpen else { return }
        services.feed.cancelTransient()
        panel.allowsKey = true
        withAnimation(Motion.island) { model.isOpen = true }
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.updateHover() }
        }
        RunLoop.main.add(pollTimer!, forMode: .common)
        scheduleAutoClose()
    }

    func close() {
        guard model.isOpen else { return }
        pollTimer?.invalidate()
        pollTimer = nil
        autoCloseWork?.cancel()
        hoverGrace.reset()
        panel.allowsKey = false
        withAnimation(Motion.soft) {
            model.isOpen = false
            model.powerMenuOpen = false
        }
    }

    private func scheduleAutoClose() {
        autoCloseWork?.cancel()
        guard services.settings.autoClose else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.model.isOpen, !self.pointerIsOverOpenIsland() else { return }
            self.close()
        }
        autoCloseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Motion.autoCloseSeconds, execute: work)
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
        let next = Self.currentCover(of: screen)
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

    private static func currentCover(of screen: NSScreen) -> ScreenCover {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]], let primary = NSScreen.screens.first else { return .none }
        let ownPid = Int(ProcessInfo.processInfo.processIdentifier)
        let windows = list.compactMap { window -> CGRect? in
            guard (window[kCGWindowLayer as String] as? Int) == 0, (window[kCGWindowOwnerPID as String] as? Int) != ownPid,
                (window[kCGWindowAlpha as String] as? Double ?? 1) > 0.01,
                let bounds = window[kCGWindowBounds as String] as? [String: CGFloat]
            else { return nil }
            return CGRect(dictionaryRepresentation: bounds as CFDictionary)
        }
        return screenCover(
            windows: windows,
            screen: globalFrame(screen.frame, primary: primary),
            visible: globalFrame(screen.visibleFrame, primary: primary)
        )
    }

    private static func globalFrame(_ frame: CGRect, primary: NSScreen) -> CGRect {
        CGRect(x: frame.minX, y: primary.frame.height - frame.maxY, width: frame.width, height: frame.height)
    }

    func tearDown() {
        pollTimer?.invalidate()
        coverTimer?.invalidate()
        peekCycle?.stop()
        openWork?.cancel()
        closeWork?.cancel()
        autoCloseWork?.cancel()
        disposables.dispose()
        IslandBus.unregister(self)
        if let activationObserver { NSWorkspace.shared.notificationCenter.removeObserver(activationObserver) }
        if let spaceObserver { NSWorkspace.shared.notificationCenter.removeObserver(spaceObserver) }
        panel.orderOut(nil)
    }
}
