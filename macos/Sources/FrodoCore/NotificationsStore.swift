import Foundation

public struct NotificationItem: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let app: String
    public let title: String
    public let body: String
    public let date: Date
}

@MainActor
public final class NotificationsStore: NotificationsSource, Destroyable {
    public let intercepted = Event<InterceptedNotification>()
    public let changed = Event<Void>()
    public private(set) var items: [NotificationItem] = []
    public var doNotDisturb = false {
        didSet { changed.emit() }
    }

    public init() {}

    public var count: Int {
        items.count
    }

    public func push(app: String, title: String, body: String, at date: Date = Date()) {
        let notification = InterceptedNotification(app: app, title: title, body: body)
        items.insert(NotificationItem(id: notification.id, app: app, title: title, body: body, date: date), at: 0)
        changed.emit()
        if !doNotDisturb { intercepted.emit(notification) }
    }

    public func dismiss(_ id: UUID) {
        items.removeAll { $0.id == id }
        changed.emit()
    }

    public func clearAll() {
        items = []
        changed.emit()
    }

    public func destroy() {
        intercepted.clearListeners()
        changed.clearListeners()
    }
}

public func claudeNotification(for event: HookEvent) -> (title: String, body: String)? {
    guard event.name == "Notification" else { return nil }
    let repo = event.cwd.replacing(/\/+$/, with: "").split(separator: "/").last.map(String.init) ?? "Claude Code"
    switch event.notificationType {
    case "permission_prompt": return (repo, "Precisa de permissão")
    case "idle_prompt": return (repo, "Esperando você")
    default: return nil
    }
}
