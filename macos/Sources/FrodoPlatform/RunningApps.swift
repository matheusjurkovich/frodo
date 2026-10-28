import AppKit
import FrodoCore

public struct RunningApp: Identifiable, Equatable {
    public let id: Int32
    public let name: String
    public let icon: NSImage?
    public let bundleIdentifier: String?
}

@MainActor
public final class RunningApps: Destroyable {
    public let changed = Event<Void>()
    public private(set) var apps: [RunningApp] = []

    private var observers: [NSObjectProtocol] = []

    public init() {
        reload()
        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.reload() }
            })
        }
    }

    private func reload() {
        let own = ProcessInfo.processInfo.processIdentifier
        let list = NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular && $0.processIdentifier != own }
            .map { RunningApp(id: $0.processIdentifier, name: $0.localizedName ?? "App", icon: $0.icon, bundleIdentifier: $0.bundleIdentifier) }
        if list != apps {
            apps = list
            changed.emit()
        }
    }

    public func activate(_ app: RunningApp) {
        NSRunningApplication(processIdentifier: app.id)?.activate()
    }

    public func destroy() {
        for observer in observers { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
        observers = []
        changed.clearListeners()
    }
}
