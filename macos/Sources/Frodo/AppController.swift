import AppKit
import FrodoCore
import FrodoPlatform

@MainActor
final class AppController {
    let services: FrodoServices
    private(set) var controllers: [IslandController] = []
    private var controllerKeys: [String] = []
    private let disposables = Disposables()
    private let coverMonitor: ScreenCoverMonitor
    private var screenObserver: NSObjectProtocol?

    init(services: FrodoServices) {
        self.services = services
        coverMonitor = ScreenCoverMonitor(scheduler: services.scheduler)
        _ = services.installHookIfPossible()
        rebuild()
        registerHotkeys()
        disposables.add(services.settings.onChanged(["monitors"]) { [weak self] in self?.rebuild() })
        disposables.add(services.settings.onChanged(["toggle-shortcut", "claude-shortcut"]) { [weak self] in self?.registerHotkeys() })
        screenObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.rebuild() }
        }
        services.system.setWantsMemory(services.settings.closedItems.contains(.ram), by: .pill)
        disposables.add(services.settings.onChanged(["closed-items"]) { [weak self] in
            guard let self else { return }
            self.services.system.setWantsMemory(self.services.settings.closedItems.contains(.ram), by: .pill)
        })
    }

    private func screens() -> [NSScreen] {
        let all = NSScreen.screens
        guard let primary = all.first else { return [] }
        switch services.settings.monitors {
        case .primary: return [primary]
        case .secondary: return all.count > 1 ? Array(all.dropFirst()) : [primary]
        case .both: return all
        }
    }

    func rebuild() {
        let targets = screens().map { (key: screenKey($0), screen: $0) }
        let wanted = Set(targets.map(\.key))
        var kept: [String: IslandController] = [:]
        for (key, controller) in zip(controllerKeys, controllers) {
            if wanted.contains(key), kept[key] == nil { kept[key] = controller } else { controller.tearDown() }
        }
        controllers = targets.map { kept[$0.key] ?? IslandController(screen: $0.screen, services: services, coverMonitor: coverMonitor) }
        controllerKeys = targets.map(\.key)
    }

    private func screenKey(_ screen: NSScreen) -> String {
        let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
        return "\(number?.intValue ?? -1)@\(NSStringFromRect(screen.frame))"
    }

    private func registerHotkeys() {
        services.hotkeys.unregisterAll()
        if let shortcut = parseShortcut(services.settings.toggleShortcut) {
            services.hotkeys.register(shortcut) { [weak self] in self?.controllerUnderMouse()?.toggle() }
        }
        if let shortcut = parseShortcut(services.settings.claudeShortcut) {
            services.hotkeys.register(shortcut) { [weak self] in
                guard let controller = self?.controllerUnderMouse() else { return }
                if controller.model.isOpen, controller.model.tab == .claude { controller.close() } else { controller.open(tab: .claude) }
            }
        }
    }

    private func controllerUnderMouse() -> IslandController? {
        let mouse = NSEvent.mouseLocation
        return controllers.first { $0.screen.frame.contains(mouse) } ?? controllers.first
    }

    func shutdown() {
        for controller in controllers { controller.tearDown() }
        if let screenObserver { NotificationCenter.default.removeObserver(screenObserver) }
        disposables.dispose()
        coverMonitor.destroy()
        services.destroy()
    }
}
