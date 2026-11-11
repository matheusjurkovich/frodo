import Foundation
import Testing

@testable import FrodoPlatform

private struct FixedStore: CredentialStore {
    let text: String?

    func read(configDir: String) async -> String? { text }
    func exists(configDir: String) async -> Bool { text != nil }
}

@Suite("credenciais em arquivo e em cadeia")
struct CredentialStoreTests {
    @Test("arquivo lê o .credentials.json do perfil")
    func fileStoreReadsTheProfileCredentials() async throws {
        let directory = NSTemporaryDirectory() + "frodo-cred-\(UUID().uuidString)"
        try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(atPath: directory) }
        let store = FileCredentialStore()
        #expect(await store.read(configDir: directory) == nil)
        #expect(await store.exists(configDir: directory) == false)
        try Data("segredo".utf8).write(to: URL(fileURLWithPath: "\(directory)/.credentials.json"))
        #expect(await store.read(configDir: directory) == "segredo")
        #expect(await store.exists(configDir: directory))
    }

    @Test("a cadeia devolve o primeiro que tem")
    func fallbackReturnsTheFirstThatHasIt() async {
        let store = FallbackCredentialStore([FixedStore(text: nil), FixedStore(text: "b"), FixedStore(text: "c")])
        #expect(await store.read(configDir: "/x") == "b")
        #expect(await store.exists(configDir: "/x"))
    }

    @Test("a cadeia sem ninguém não tem credencial")
    func emptyFallbackHasNothing() async {
        let store = FallbackCredentialStore([FixedStore(text: nil)])
        #expect(await store.read(configDir: "/x") == nil)
        #expect(await store.exists(configDir: "/x") == false)
    }
}
