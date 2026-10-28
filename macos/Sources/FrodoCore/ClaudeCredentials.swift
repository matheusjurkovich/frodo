import Foundation

public struct Credentials: Equatable, Sendable {
    public let accessToken: String
    public let refreshToken: String?
    public let expiresAt: Double
    public let subscriptionType: String?
    public let rateLimitTier: String?

    public init(accessToken: String, refreshToken: String?, expiresAt: Double, subscriptionType: String?, rateLimitTier: String?) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
        self.subscriptionType = subscriptionType
        self.rateLimitTier = rateLimitTier
    }
}

private let refreshSkew: TimeInterval = 5 * 60

public func parseCredentials(_ text: String?) -> Credentials? {
    guard let text, let root = JSONValue(text: text), let oauth = root.field("claudeAiOauth"), oauth.object != nil,
        let accessToken = oauth.field("accessToken")?.nonEmptyString
    else { return nil }
    return Credentials(
        accessToken: accessToken,
        refreshToken: oauth.field("refreshToken")?.nonEmptyString,
        expiresAt: oauth.field("expiresAt")?.finiteNumber ?? 0,
        subscriptionType: oauth.field("subscriptionType")?.nonEmptyString,
        rateLimitTier: oauth.field("rateLimitTier")?.nonEmptyString
    )
}

public func needsRefresh(expiresAt: Double, now: Date) -> Bool {
    expiresAt > 0 && expiresAt / 1000 - now.timeIntervalSince1970 <= refreshSkew
}
