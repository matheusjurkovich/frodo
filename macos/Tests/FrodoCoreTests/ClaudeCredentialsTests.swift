import Foundation
import Testing

@testable import FrodoCore

private let now = utc(2026, 10, 24, 12, 0)

@Suite("credenciais")
struct ClaudeCredentialsTests {
    @Test("lê o token e o plano do JSON do Claude Code")
    func readsTokenAndPlan() {
        let text = #"{"claudeAiOauth":{"accessToken":"a","refreshToken":"r","expiresAt":5,"subscriptionType":"max","rateLimitTier":"x_20x"}}"#
        #expect(
            parseCredentials(text)
                == Credentials(accessToken: "a", refreshToken: "r", expiresAt: 5, subscriptionType: "max", rateLimitTier: "x_20x")
        )
        #expect(parseCredentials(#"{"claudeAiOauth":{}}"#) == nil)
        #expect(parseCredentials("{quebrado") == nil)
        #expect(parseCredentials(nil) == nil)
    }

    @Test("ignora campos extras como os tokens de MCP")
    func ignoresExtraFields() {
        let text = #"{"claudeAiOauth":{"accessToken":"a","expiresAt":5},"mcpOAuth":{"servidor":{"accessToken":"outro"}}}"#
        #expect(parseCredentials(text)?.accessToken == "a")
        #expect(parseCredentials(text)?.refreshToken == nil)
    }

    @Test("renova cinco minutos antes de expirar")
    func refreshesFiveMinutesBeforeExpiring() {
        func millis(_ offset: TimeInterval) -> Double { now.addingTimeInterval(offset).timeIntervalSince1970 * 1000 }
        #expect(!needsRefresh(expiresAt: 0, now: now))
        #expect(!needsRefresh(expiresAt: millis(10 * 60), now: now))
        #expect(needsRefresh(expiresAt: millis(2 * 60), now: now))
    }
}
