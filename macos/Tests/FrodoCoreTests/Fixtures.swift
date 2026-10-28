import Foundation

@testable import FrodoCore

let referenceDate = Date(timeIntervalSince1970: 1_790_000_000)

func makeSession(
    _ sessionId: String,
    step: String = "",
    status: SessionStatus = .working,
    tool: String? = "Read",
    updatedAt: Date = referenceDate
) -> SessionState {
    SessionState(
        sessionId: sessionId,
        cwd: "/home/u/loja-api",
        repo: "loja-api",
        status: status,
        tool: tool,
        step: step,
        pid: 42,
        since: updatedAt,
        updatedAt: updatedAt
    )
}

func makeRequest(_ key: String, sessionId: String = "a", since: TimeInterval = 0) -> PendingRequest {
    PendingRequest(
        key: key,
        sessionId: sessionId,
        request: "1",
        pid: 1,
        tool: "Bash",
        since: Date(timeIntervalSince1970: since)
    )
}

func makeTrack(_ title: String, coverUrl: String = "") -> MediaTrack {
    MediaTrack(title: title, artist: "a", coverUrl: coverUrl, app: "p")
}

func makeNotification(_ title: String) -> InterceptedNotification {
    InterceptedNotification(app: "app", title: title, body: "")
}

func json(_ text: String) -> JSONValue {
    JSONValue(text: text) ?? .null
}

func utc(_ year: Int, _ month: Int, _ day: Int, _ hour: Int, _ minute: Int) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
    return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)) ?? Date(timeIntervalSince1970: 0)
}

func transcriptLine(
    id: String,
    at: Date,
    model: String = "claude-opus-5-5",
    cwd: String = "/home/u/frodo",
    session: String = "s1",
    input: Int = 0,
    output: Int = 0,
    cacheRead: Int = 0,
    cacheWrite: Int = 0,
    branch: String = "main",
    todos: [String]? = nil,
    sidechain: Bool = false
) -> String {
    let content: JSONValue =
        todos.map { statuses in
            .array([
                .object([
                    "type": .string("tool_use"), "name": .string("TodoWrite"),
                    "input": .object(["todos": .array(statuses.map { .object(["status": .string($0)]) })]),
                ])
            ])
        } ?? .array([.object(["type": .string("text"), "text": .string("ok")])])
    let value: JSONValue = .object([
        "type": .string("assistant"),
        "timestamp": .string(Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(at)),
        "sessionId": .string(session),
        "cwd": .string(cwd),
        "gitBranch": .string(branch),
        "isSidechain": .bool(sidechain),
        "message": .object([
            "id": .string(id),
            "model": .string(model),
            "content": content,
            "usage": .object([
                "input_tokens": .number(Double(input)),
                "output_tokens": .number(Double(output)),
                "cache_read_input_tokens": .number(Double(cacheRead)),
                "cache_creation_input_tokens": .number(Double(cacheWrite)),
            ]),
        ]),
    ])
    return (try? JSONEncoder().encode(value)).map { String(decoding: $0, as: UTF8.self) } ?? ""
}

func localDate(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0) -> Date {
    Calendar.current.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)) ?? Date(timeIntervalSince1970: 0)
}

func roundTrip(_ index: ClaudeIndex) -> ClaudeIndex {
    let data = (try? JSONEncoder().encode(index.toJSON())) ?? Data()
    return ClaudeIndex(json: JSONValue(data: data))
}
