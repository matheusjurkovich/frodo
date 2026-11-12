import Foundation
import Testing

@testable import FrodoCore

private func iso(_ date: Date) -> String {
    Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(date)
}

private func at(_ minute: Int) -> String {
    iso(localDate(2026, 10, 27, 10, minute))
}

private func utc(_ text: String) -> Date {
    parseISODate(text) ?? Date(timeIntervalSince1970: 0)
}

private func json(_ value: [String: Any]) -> String {
    let data = (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])) ?? Data()
    return String(decoding: data, as: UTF8.self)
}

nonisolated(unsafe) private let tokens: [String: Any] = ["input": 1000, "output": 30, "cached": 600, "thoughts": 70, "tool": 5, "total": 1105]

nonisolated(unsafe) private let messages: [[String: Any]] = [
    ["id": "u1", "timestamp": at(0), "type": "user", "content": "oi"],
    ["id": "g1", "timestamp": at(1), "type": "gemini", "model": "gemini-3.1-pro-preview", "tokens": tokens],
    ["id": "g2", "timestamp": at(2), "type": "gemini", "model": "gemini-3-flash-preview", "tokens": NSNull()],
    ["id": "i1", "timestamp": at(3), "type": "info", "content": "x"],
]

nonisolated(unsafe) private let meta: [String: Any] = ["sessionId": "sess-1", "projectHash": "abc", "startTime": at(0), "lastUpdated": at(3)]

@Test("lê o formato JSON antigo")
func geminiOldFormat() {
    var whole = meta
    whole["messages"] = messages
    let session = parseGeminiSession(json(whole))
    #expect(session?.id == "sess-1")
    #expect(session?.requests == [
        GeminiRequest(id: "g1", at: localDate(2026, 10, 27, 10, 1), model: "gemini-3.1-pro-preview", input: 405, output: 100, cacheRead: 600)
    ])
}

@Test("lê o JSONL do 0.58 e fica com a última versão de cada mensagem")
func geminiJsonl() {
    var rewritten = messages[2]
    rewritten["tokens"] = tokens.merging(["cached": 0]) { _, new in new }
    let lines =
        [meta] + messages + [["$set": ["lastUpdated": at(4)]], rewritten, ["$rewindTo": "g1"]]
    let text = (lines.map(json) + ["linha quebrada {"]).joined(separator: "\n")
    let session = parseGeminiSession(text)
    #expect(session?.requests.map { [$0.id, String($0.input), String($0.output)] } == [
        ["g1", "405", "100"],
        ["g2", "1005", "100"],
    ])
}

@Test("retoma o JSONL de onde parou e reconhece linha incompleta")
func geminiResume() {
    let lines = ([meta] + messages).map(json)
    let whole = parseGeminiSession(lines.joined(separator: "\n"))
    let parser = GeminiSessionParser()
    parser.feed(lines[0..<3].joined(separator: "\n") + "\n")
    #expect(!parser.line(String(lines[3].prefix(10))))
    parser.feed(lines[3...].joined(separator: "\n") + "\n")
    #expect(parser.result() == whole)
}

@Test("descarta arquivo sem sessionId")
func geminiNoSession() {
    #expect(parseGeminiSession("{}") == nil)
    #expect(parseGeminiSession("nada") == nil)
    #expect(parseGeminiSession(json(meta))?.requests == [])
}

@Test("contagem gigante ou fora do intervalo vira zero sem quebrar")
func geminiHugeCount() {
    let huge: [String: Any] = ["input": 1e300, "output": 1e19, "cached": 5, "thoughts": 2, "tool": 1]
    var message = messages[1]
    message["tokens"] = huge
    var whole = meta
    whole["messages"] = [message]
    let request = parseGeminiSession(json(whole))?.requests.first
    #expect(request?.input == 1)
    #expect(request?.output == 2)
    #expect(request?.cacheRead == 5)
}

@Test("agrupa pedidos em células por hora")
func geminiGroupsCells() {
    var whole = meta
    var second = messages[1]
    second["id"] = "g3"
    whole["messages"] = [messages[1], second]
    let session = parseGeminiSession(json(whole))
    let cells = geminiCells(session?.requests ?? [], project: "frodo", session: "sess-1")
    #expect(cells.map { [$0.model, $0.project, $0.session, String($0.input), String($0.output), String($0.cacheRead)] } == [
        ["gemini-3.1-pro-preview", "frodo", "sess-1", "810", "200", "1200"]
    ])
}

@Test("nomeia o projeto pela pasta ou pelo hash conhecido")
func geminiProjectNames() {
    let hash = String(repeating: "a", count: 64)
    let projects = parseProjects(json(["projects": ["/home/u/frodo": "frodo", "/x": 3]]))
    #expect(projects.count == 1)
    #expect(projects.first?.0 == "/home/u/frodo")
    #expect(projects.first?.1 == "frodo")
    #expect(parseProjects(nil).isEmpty)
    #expect(projectName("nazgul", namesByHash: [:]) == "nazgul")
    #expect(projectName(hash, namesByHash: [hash: "frodo"]) == "frodo")
    #expect(projectName(String(repeating: "b", count: 64), namesByHash: [:]) == "outro")
}

@Test("acha a meia-noite do Pacífico no horário de verão e no padrão")
func geminiPacificMidnight() {
    let pdt = utc("2026-07-15T10:00:00Z")
    #expect(pacificDayStart(pdt) == utc("2026-07-15T07:00:00Z"))
    #expect(nextPacificReset(pdt) == utc("2026-07-16T07:00:00Z"))
    let pst = utc("2026-01-15T05:00:00Z")
    #expect(pacificDayStart(pst) == utc("2026-01-14T08:00:00Z"))
    #expect(nextPacificReset(pst) == utc("2026-01-15T08:00:00Z"))
}

@Test("acerta os dias em que o horário de verão muda")
func geminiPacificTransitions() {
    let spring = utc("2026-03-08T12:00:00Z")
    #expect(pacificDayStart(spring) == utc("2026-03-08T08:00:00Z"))
    #expect(nextPacificReset(spring) == utc("2026-03-09T07:00:00Z"))
    let fall = utc("2026-11-01T20:00:00Z")
    #expect(pacificDayStart(fall) == utc("2026-11-01T07:00:00Z"))
    #expect(nextPacificReset(fall) == utc("2026-11-02T08:00:00Z"))
}

@Test("conta pedidos do dia do Pacífico e do último minuto")
func geminiQuotaCounts() {
    let now = utc("2026-07-15T10:00:00Z")
    let times = [
        utc("2026-07-15T06:59:59Z"), utc("2026-07-15T07:00:00Z"),
        now.addingTimeInterval(-61), now.addingTimeInterval(-30), now, now.addingTimeInterval(1),
    ]
    #expect(geminiQuota(times, limit: 1000, now: now) == GeminiQuota(
        requests: 4, limit: 1000, perMinute: 2, resetsAt: utc("2026-07-16T07:00:00Z")
    ))
}

@Test("agrupa e rotula os modelos")
func geminiModelGroups() {
    let models = [
        "gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash-lite", "gemini-2.5-pro-preview-05-06", "gemma-3",
    ]
    #expect(models.map(geminiModels.family) == ["gemini-pro", "gemini-flash", "gemini-flash", "gemini-pro", "gemini-other"])
    #expect(models.map(geminiModels.label) == [
        "Gemini 3.1 Pro", "Gemini 3 Flash", "Gemini 2.5 Flash Lite", "Gemini 2.5 Pro", "gemma-3",
    ])
    #expect(geminiModels.label("") == "Outro")
}

@Test("estima a cota diária e por minuto")
func geminiMeterEstimates() {
    let meters = geminiMeters(GeminiQuota(requests: 412, limit: 1000, perMinute: 12, resetsAt: localDate(2026, 10, 28, 4, 0)))
    #expect(abs((meters.first?.percent ?? 0) - 41.2) < 1e-9)
    #expect(meters.first?.note == "412 de 1.000 · reinicia às 04:00")
    #expect(meters.last?.percent == 20)
    #expect(meters.last?.note == "12 de 60 no último minuto")
    #expect(geminiMeters(nil).isEmpty)
}

@Test("rotula o plano pelo limite diário")
func geminiPlanLabels() {
    #expect(geminiPlanLabel(1000) == "Login Google")
    #expect(geminiPlanLabel(1500) == "Standard")
    #expect(geminiPlanLabel(2000) == "Enterprise")
    #expect(geminiPlanLabel(7) == nil)
}

@Test("sha256 bate com os vetores do FIPS 180-2")
func sha256Vectors() {
    #expect(sha256Hex("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    #expect(sha256Hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    #expect(
        sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
            == "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")
    #expect(sha256Hex("/home/u/frodo").count == 64)
}
