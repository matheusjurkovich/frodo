import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

private struct FakeStore: CredentialStore {
    let text: String?

    func read(configDir: String) async -> String? { text }
    func exists(configDir: String) async -> Bool { text != nil }
}

private actor RequestLog {
    private(set) var requests: [HTTPRequest] = []

    func append(_ request: HTTPRequest) {
        requests.append(request)
    }
}

private struct ScriptedRunner: CommandRunner {
    let results: [String: CommandResult]

    func run(_ executable: String, arguments: [String], currentDirectory: String?) async -> CommandResult? {
        guard let service = arguments.last else { return nil }
        return results[service]
    }
}

private let now = Date(timeIntervalSince1970: 1_790_000_000)

private func credentials(expiresInSeconds: Double) -> String {
    let expiresAt = (now.timeIntervalSince1970 + expiresInSeconds) * 1000
    return #"{"claudeAiOauth":{"accessToken":"token-abc","refreshToken":"r","expiresAt":\#(Int(expiresAt)),"subscriptionType":"max","rateLimitTier":"default_claude_max_20x"}}"#
}

@Suite("serviço do Keychain")
struct KeychainNamesTests {
    @Test("perfil customizado usa o sufixo do hash do diretório")
    func customProfileUsesDirectoryHashSuffix() {
        let names = keychainServiceNames(configDir: "/Users/pedrolindo/.claude-trabalho", defaultConfigDir: "/Users/pedrolindo/.claude")
        #expect(names.first == "Claude Code-credentials-bab3aca1")
        #expect(!names.contains("Claude Code-credentials"))
    }

    @Test("diretório padrão tenta o serviço sem sufixo primeiro")
    func defaultDirectoryTriesUnsuffixedServiceFirst() {
        let names = keychainServiceNames(configDir: "/Users/pedrolindo/.claude/", defaultConfigDir: "/Users/pedrolindo/.claude")
        #expect(names.first == "Claude Code-credentials")
        #expect(names.count == 3)
    }

    @Test("nome de conta inválido vira o nome padrão do Claude Code")
    func invalidAccountNameBecomesClaudeCodeDefault() {
        #expect(keychainAccountName(user: "pedrolindo") == "pedrolindo")
        #expect(keychainAccountName(user: "maria silva") == "claude-code-user")
    }

    @Test("lê do primeiro serviço que responde")
    func readsFromFirstServiceThatAnswers() async {
        let names = keychainServiceNames(configDir: "/Users/u/.claude-x", defaultConfigDir: "/Users/u/.claude")
        let runner = ScriptedRunner(results: [names[1]: CommandResult(status: 0, output: "segredo\n")])
        let store = KeychainCredentialStore(runner: runner, user: "u", defaultConfigDir: "/Users/u/.claude")
        #expect(await store.read(configDir: "/Users/u/.claude-x") == "segredo")
        #expect(await store.exists(configDir: "/Users/u/.claude-x"))
        #expect(await store.read(configDir: "/Users/u/.claude-y") == nil)
    }
}

@Suite("cliente do Claude")
struct ClaudeClientTests {
    @Test("manda o token e devolve o JSON")
    func sendsTokenAndReturnsJSON() async throws {
        let log = RequestLog()
        let client = ClaudeClient(
            configDir: "/x", store: FakeStore(text: credentials(expiresInSeconds: 3600)),
            transport: { request in
                await log.append(request)
                return HTTPResponse(status: 200, body: #"{"limits":[]}"#)
            },
            now: { now }
        )
        let usage = try await client.fetchUsage()
        #expect(usage == .object(["limits": .array([])]))
        let requests = await log.requests
        #expect(requests.map(\.token) == ["token-abc"])
        #expect(requests.map(\.url) == [usageURL])
    }

    @Test("resposta de erro vira ClaudeApiError com a mensagem da API")
    func errorResponseBecomesApiErrorWithMessage() async {
        let client = ClaudeClient(
            configDir: "/x", store: FakeStore(text: credentials(expiresInSeconds: 3600)),
            transport: { _ in HTTPResponse(status: 403, body: #"{"error":{"message":"Sem plano"}}"#) }, now: { now }
        )
        await #expect(throws: ClaudeApiError(status: 403, body: #"{"error":{"message":"Sem plano"}}"#)) {
            try await client.fetchProfile()
        }
    }

    @Test("sem credencial não está logado")
    func missingCredentialsMeansSignedOut() async {
        let client = ClaudeClient(configDir: "/x", store: FakeStore(text: nil), transport: { _ in HTTPResponse(status: 200, body: "{}") }, now: { now })
        await #expect(throws: SignedOutError()) { try await client.fetchUsage() }
    }

    @Test("token expirado vira 401 sem chamar a API")
    func expiredTokenBecomesUnauthorizedWithoutCallingApi() async {
        let log = RequestLog()
        let client = ClaudeClient(
            configDir: "/x", store: FakeStore(text: credentials(expiresInSeconds: -10)),
            transport: { request in
                await log.append(request)
                return HTTPResponse(status: 200, body: "{}")
            },
            now: { now }
        )
        await #expect(throws: ClaudeApiError(status: 401, body: "")) { try await client.fetchUsage() }
        #expect(await log.requests.isEmpty)
    }

    @Test("lê o plano das credenciais")
    func readsPlanFromCredentials() async {
        let client = ClaudeClient(configDir: "/x", store: FakeStore(text: credentials(expiresInSeconds: 3600)), transport: { _ in HTTPResponse(status: 200, body: "{}") }, now: { now })
        let tier = await client.readTier()
        #expect(tier == Tier(subscriptionType: "max", rateLimitTier: "default_claude_max_20x"))
    }
}
