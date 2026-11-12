import Foundation

public struct InterceptedNotification: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let app: String
    public let title: String
    public let body: String
    public let provider: AiProvider?

    public init(app: String, title: String, body: String, provider: AiProvider? = nil) {
        self.id = UUID()
        self.app = app
        self.title = title
        self.body = body
        self.provider = provider
    }
}
