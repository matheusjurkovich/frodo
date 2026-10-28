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
    private var pollTimer: Timer?
    private var coverTimer: Timer?
    private var disposables = Disposables()
    private var activationObserver: NSObjectProtocol?

    init(screen: NSScreen, services: FrodoServices) {
        self.screen = screen
        self.services = services
        super.init()
        configurePanel()
        let root = IslandRootView(services: services, model: model, onToggle: { [weak self] in self?.toggle() }, onClose: { [weak self] in self?.close() })
        let hosting = ShapeHostingView(rootView: root)
        hosting.shapeSize = { [weak self] in
            guard let self else { return .zero }
            let size = self.model.targetSize
            return self.model.showsTongue ? CGSize(width: size.width, height: size.height + 8) : size
        }
        hosting.onPointer = { [weak self] in self?.updateHover() }
        panel.contentView = hosting
        host = hosting
        place()
        panel.orderFrontRegardless()
        model.updateActivity(services.feed.current)
        disposables.add(services.feed.changed.on { [weak self] _ in self?.syncActivity() })
        coverTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refreshCovered() }
        }
        RunLoop.main.add(coverTimer!, forMode: .common)
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
        let cap = min(Theme.Size.maxIslandHeight, screen.visibleFrame.height - 40)
        let height = cap + Theme.Size.panelPadding
        let width = Theme.Size.islandWidth + Theme.Size.panelPadding * 2
        model.panelHeight = height
        let top = screen.visibleFrame.maxY - Theme.Size.topMargin
        panel.setFrame(NSRect(x: screen.frame.midX - width / 2, y: top - height, width: width, height: height), display: true)
    }

    private func shapeRect(open: Bool) -> NSRect {
        let size: CGSize
        if open {
            size = CGSize(width: Theme.Size.islandWidth, height: min(model.islandHeight, Theme.Size.maxIslandHeight))
        } else if model.showsTongue {
            size = CGSize(width: 120, height: 16)
        } else {
            size = model.pillSize
        }
        return NSRect(x: panel.frame.midX - size.width / 2, y: panel.frame.maxY - size.height, width: size.width, height: size.height)
    }

    func updateHover() {
        let mouse = NSEvent.mouseLocation
        let inside = shapeRect(open: model.isOpen).contains(mouse)
        if inside {
            closeWork?.cancel()
            closeWork = nil
            if !model.isOpen, openWork == nil, services.settings.openOnHover {
                let work = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    self.openWork = nil
                    if self.shapeRect(open: false).contains(NSEvent.mouseLocation) { self.open() }
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
                    if !self.shapeRect(open: true).contains(NSEvent.mouseLocation) { self.close() }
                }
                closeWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + Motion.closeDelay, execute: work)
            }
        }
    }

    func toggle() {
        model.isOpen ? close() : open()
    }

    func open(tab: TabId? = nil) {
        if let tab { model.select(tab, visible: visibleTabs(hidden: services.settings.hiddenTabs)) }
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
        panel.allowsKey = false
        withAnimation(Motion.standard) {
            model.isOpen = false
            model.powerMenuOpen = false
        }
    }

    private func scheduleAutoClose() {
        autoCloseWork?.cancel()
        guard services.settings.autoClose else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.model.isOpen, !self.shapeRect(open: true).contains(NSEvent.mouseLocation) else { return }
            self.close()
        }
        autoCloseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Motion.autoCloseSeconds, execute: work)
    }

    private func syncActivity() {
        withAnimation(Motion.standard) { model.updateActivity(services.feed.current) }
    }

    private func refreshCovered() {
        let covered = Self.isCovered(screen: screen)
        if covered != model.covered { withAnimation(Motion.standard) { model.covered = covered } }
    }

    private static func isCovered(screen: NSScreen) -> Bool {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]], let primary = NSScreen.screens.first else { return false }
        let frame = CGRect(x: screen.frame.minX, y: primary.frame.height - screen.frame.maxY, width: screen.frame.width, height: screen.frame.height)
        let ownPid = Int(ProcessInfo.processInfo.processIdentifier)
        for window in list {
            guard (window[kCGWindowLayer as String] as? Int) == 0, (window[kCGWindowOwnerPID as String] as? Int) != ownPid,
                let bounds = window[kCGWindowBounds as String] as? [String: CGFloat],
                let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary)
            else { continue }
            if rect.width >= frame.width - 1, rect.height >= frame.height - 1, abs(rect.minX - frame.minX) < 2, abs(rect.minY - frame.minY) < 2 { return true }
        }
        return false
    }

    func tearDown() {
        pollTimer?.invalidate()
        coverTimer?.invalidate()
        openWork?.cancel()
        closeWork?.cancel()
        autoCloseWork?.cancel()
        disposables.dispose()
        IslandBus.unregister(self)
        if let activationObserver { NSWorkspace.shared.notificationCenter.removeObserver(activationObserver) }
        panel.orderOut(nil)
    }
}
