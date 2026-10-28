import AppKit
import FrodoCore
import FrodoPlatform

@MainActor
final class AppController {
    let services: FrodoServices
    private(set) var controllers: [IslandController] = []
    private let disposables = Disposables()
    private var screenObserver: NSObjectProtocol?

    init(services: FrodoServices) {
        self.services = services
        _ = services.installHookIfPossible()
        rebuild()
        registerHotkeys()
        disposables.add(services.settings.onChanged(["monitors"]) { [weak self] in self?.rebuild() })
        disposables.add(services.settings.onChanged(["toggle-shortcut", "claude-shortcut"]) { [weak self] in self?.registerHotkeys() })
        screenObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.rebuild() }
        }
        services.system.setWantsMemory(services.settings.closedItems.contains(.ram))
        disposables.add(services.settings.onChanged(["closed-items"]) { [weak self] in
            guard let self else { return }
            self.services.system.setWantsMemory(self.services.settings.closedItems.contains(.ram))
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
        for controller in controllers { controller.tearDown() }
        controllers = screens().map { IslandController(screen: $0, services: services) }
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
        services.destroy()
    }
}
