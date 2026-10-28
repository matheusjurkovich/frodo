import Foundation
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

private func line(id: String, session: String = "s1", input: Int, at: Date) -> String {
    let stamp = Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(at)
    return #"{"type":"assistant","timestamp":"\#(stamp)","sessionId":"\#(session)","cwd":"/home/u/loja","gitBranch":"main","isSidechain":false,"message":{"id":"\#(id)","model":"claude-opus-5-5","content":[],"usage":{"input_tokens":\#(input),"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}"#
}

private struct Fixture {
    let root: String
    let configDir: String
    let transcript: String
    let cache: String

    init() throws {
        root = NSTemporaryDirectory() + "frodo-scan-\(UUID().uuidString)"
        configDir = "\(root)/.claude"
        let project = "\(configDir)/projects/-home-u-loja"
        try FileManager.default.createDirectory(atPath: project, withIntermediateDirectories: true)
        transcript = "\(project)/s1.jsonl"
        cache = "\(root)/cache/claude-index.json"
    }

    func write(_ text: String, append: Bool = false) throws {
        if append, let handle = FileHandle(forWritingAtPath: transcript) {
            try handle.seekToEnd()
            try handle.write(contentsOf: Data(text.utf8))
            try handle.close()
        } else {
            try Data(text.utf8).write(to: URL(fileURLWithPath: transcript))
        }
    }

    func cleanup() { try? FileManager.default.removeItem(atPath: root) }
}

@Suite("TranscriptScanner")
struct TranscriptScannerTests {
    @Test("conta só as linhas completas e retoma do offset")
    func countsOnlyCompleteLinesAndResumesFromOffset() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let now = Date()
        let first = line(id: "m1", input: 100, at: now)
        let second = line(id: "m2", input: 50, at: now)
        try fixture.write(first + "\n" + String(second.prefix(40)))
        let scanner = TranscriptScanner(cachePath: fixture.cache)
        var index = await scanner.scan(configDirs: [fixture.configDir], now: now, wanted: true)
        #expect(index.summary(.today, now: now).input == 100)
        try fixture.write(String(second.dropFirst(40)) + "\n", append: true)
        index = await scanner.scan(configDirs: [fixture.configDir], now: now, wanted: true)
        #expect(index.summary(.today, now: now).input == 150)
        index = await scanner.scan(configDirs: [fixture.configDir], now: now, wanted: true)
        #expect(index.summary(.today, now: now).input == 150)
    }

    @Test("guarda o cache e não conta de novo depois de reabrir")
    func persistsCacheAndDoesNotRecountAfterReopening() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let now = Date()
        try fixture.write(line(id: "m1", input: 100, at: now) + "\n")
        let scanner = TranscriptScanner(cachePath: fixture.cache)
        _ = await scanner.scan(configDirs: [fixture.configDir], now: now, wanted: false)
        #expect(FileManager.default.fileExists(atPath: fixture.cache))
        let reopened = TranscriptScanner(cachePath: fixture.cache)
        let index = await reopened.scan(configDirs: [fixture.configDir], now: now, wanted: false)
        #expect(index.summary(.today, now: now).input == 100)
        #expect(index.session("s1")?.tokens == 100)
    }

    @Test("arquivo que encolhe volta ao tamanho novo sem contar de novo")
    func shrunkFileResetsToNewSizeWithoutRecounting() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let now = Date()
        try fixture.write(line(id: "m1", input: 100, at: now) + "\n" + line(id: "m2", input: 100, at: now) + "\n")
        let scanner = TranscriptScanner(cachePath: fixture.cache)
        _ = await scanner.scan(configDirs: [fixture.configDir], now: now, wanted: false)
        try fixture.write(line(id: "m3", input: 7, at: now) + "\n")
        let index = await scanner.scan(configDirs: [fixture.configDir], now: now, wanted: false)
        #expect(index.summary(.today, now: now).input == 200)
    }

    @Test("cache corrompido recomeça do zero")
    func corruptedCacheStartsOver() async throws {
        let fixture = try Fixture()
        defer { fixture.cleanup() }
        let now = Date()
        try FileManager.default.createDirectory(atPath: (fixture.cache as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
        try Data("lixo".utf8).write(to: URL(fileURLWithPath: fixture.cache))
        try fixture.write(line(id: "m1", input: 100, at: now) + "\n")
        let scanner = TranscriptScanner(cachePath: fixture.cache)
        let index = await scanner.scan(configDirs: [fixture.configDir], now: now, wanted: false)
        #expect(index.summary(.today, now: now).input == 100)
    }
}
