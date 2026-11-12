import FrodoCore
import Foundation

public let usageURL = "https://api.anthropic.com/api/oauth/usage"
public let profileURL = "https://api.anthropic.com/api/oauth/profile"

private let betaHeader = "oauth-2025-04-20"
private let apiVersion = "2023-06-01"

public struct HTTPRequest: Sendable {
    public let url: String
    public let token: String

    public init(url: String, token: String) {
        self.url = url
        self.token = token
    }
}

public struct HTTPResponse: Sendable {
    public let status: Int
    public let body: String

    public init(status: Int, body: String) {
        self.status = status
        self.body = body
    }
}

public typealias Transport = @Sendable (HTTPRequest) async throws -> HTTPResponse

public struct ClaudeApiError: Error, Equatable {
    public let status: Int
    public let apiMessage: String?

    public init(status: Int, body: String) {
        self.status = status
        apiMessage = JSONValue(text: body)?.field("error", "message")?.string
    }
}

public struct SignedOutError: Error, Equatable {}

public struct ExpiredTokenError: Error, Equatable {}

public struct Tier: Equatable, Sendable {
    public let subscriptionType: String?
    public let rateLimitTier: String?
}

public func urlSessionTransport(timeout: TimeInterval = 15) -> Transport {
    { request in
        guard let url = URL(string: request.url) else { throw ClaudeApiError(status: 0, body: "") }
        var urlRequest = URLRequest(url: url, timeoutInterval: timeout)
        urlRequest.setValue(betaHeader, forHTTPHeaderField: "anthropic-beta")
        urlRequest.setValue(apiVersion, forHTTPHeaderField: "anthropic-version")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        urlRequest.setValue("Bearer \(request.token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        return HTTPResponse(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: String(decoding: data, as: UTF8.self))
    }
}

public struct ClaudeClient: Sendable {
    private let configDir: String
    private let store: any CredentialStore
    private let transport: Transport
    private let now: @Sendable () -> Date

    public init(configDir: String, store: any CredentialStore, transport: @escaping Transport, now: @escaping @Sendable () -> Date = { Date() }) {
        self.configDir = configDir
        self.store = store
        self.transport = transport
        self.now = now
    }

    public func loadCredentials() async -> Credentials? {
        parseCredentials(await store.read(configDir: configDir))
    }

    public func fetchUsage() async throws -> JSONValue {
        try await fetchUsage(with: await loadCredentials())
    }

    public func fetchProfile() async throws -> JSONValue {
        try await fetchProfile(with: await loadCredentials())
    }

    public func fetchUsage(with credentials: Credentials?) async throws -> JSONValue {
        try await get(usageURL, credentials: credentials)
    }

    public func fetchProfile(with credentials: Credentials?) async throws -> JSONValue {
        try await get(profileURL, credentials: credentials)
    }

    public func readTier() async -> Tier {
        let credentials = await loadCredentials()
        return Tier(subscriptionType: credentials?.subscriptionType, rateLimitTier: credentials?.rateLimitTier)
    }

    private func get(_ url: String, credentials: Credentials?) async throws -> JSONValue {
        let token = try validToken(credentials)
        let response = try await transport(HTTPRequest(url: url, token: token))
        guard (200 ..< 300).contains(response.status) else { throw ClaudeApiError(status: response.status, body: response.body) }
        return response.body.isEmpty ? .object([:]) : (JSONValue(text: response.body) ?? .object([:]))
    }

    private func validToken(_ credentials: Credentials?) throws -> String {
        guard let credentials else { throw SignedOutError() }
        if needsRefresh(expiresAt: credentials.expiresAt, now: now()) {
            throw ExpiredTokenError()
        }
        return credentials.accessToken
    }
}
