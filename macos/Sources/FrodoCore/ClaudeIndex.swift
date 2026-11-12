import Foundation

public struct SessionStats: Equatable, Sendable {
    public let tokens: Int
    public let model: String
    public let contextTokens: Int
    public let branch: String?
    public let startedAt: Date
    public let lastAt: Date
    public let todos: TodoProgress?
}

private let indexVersion = 4.0
private let claudeModels = ModelGroups(
    order: ModelFamily.allCases.map(\.rawValue),
    family: { modelFamily($0).rawValue },
    label: { modelDisplayName($0) }
)
private let epoch = Date(timeIntervalSince1970: 0)

private struct CellKey: Hashable {
    let hour: Date
    let model: String
    let project: String
    let session: String
}

private struct Counts {
    var input = 0
    var output = 0
    var cacheRead = 0
}

private struct SessionRecord {
    var tokens = 0
    var model = ""
    var contextTokens = 0
    var branch: String?
    var startedAt: Date
    var lastAt: Date
    var todos: TodoProgress?
    var todosAt = epoch
    var mainAt = epoch
}

private struct Seen {
    var at: Date
    var output: Int
}

public struct ClaudeIndex: Sendable {
    private var cells: [CellKey: Counts] = [:]
    private var sessions: [String: SessionRecord] = [:]
    private var ids: [String: Seen] = [:]

    public init() {}

    public func has(_ id: String) -> Bool {
        ids[id] != nil
    }

    public mutating func add(_ entry: TranscriptEntry, calendar: Calendar = .current) {
        let usage = entry.usage
        if var seen = ids[usage.id] {
            let extra = usage.output - seen.output
            if extra > 0 {
                seen.output = usage.output
                ids[usage.id] = seen
                count(
                    UsageRecord(
                        id: usage.id, timestamp: usage.timestamp, model: usage.model, project: usage.project, sessionId: usage.sessionId,
                        input: 0, output: extra, cacheRead: 0, cacheWrite: 0
                    ),
                    calendar: calendar
                )
            }
            if let todos = entry.todos, !entry.sidechain { setTodos(sessionId: usage.sessionId, timestamp: usage.timestamp, todos: todos) }
            return
        }
        ids[usage.id] = Seen(at: usage.timestamp, output: usage.output)
        count(usage, calendar: calendar)
        if entry.sidechain { return }
        if var session = sessions[usage.sessionId], usage.timestamp >= session.mainAt {
            session.model = usage.model
            session.contextTokens = usage.input + usage.cacheRead + usage.cacheWrite
            session.branch = entry.branch
            session.mainAt = usage.timestamp
            sessions[usage.sessionId] = session
        }
        if let todos = entry.todos { setTodos(sessionId: usage.sessionId, timestamp: usage.timestamp, todos: todos) }
    }

    private mutating func count(_ usage: UsageRecord, calendar: Calendar) {
        let key = CellKey(hour: hourStart(usage.timestamp, calendar: calendar), model: usage.model, project: usage.project, session: usage.sessionId)
        var counts = cells[key] ?? Counts()
        counts.input += usage.input
        counts.output += usage.output
        counts.cacheRead += usage.cacheRead
        cells[key] = counts
        var session = sessions[usage.sessionId] ?? SessionRecord(startedAt: usage.timestamp, lastAt: usage.timestamp)
        session.tokens += usage.input + usage.output
        session.startedAt = min(session.startedAt, usage.timestamp)
        session.lastAt = max(session.lastAt, usage.timestamp)
        sessions[usage.sessionId] = session
    }

    public mutating func setTodos(sessionId: String, timestamp: Date, todos: TodoProgress) {
        guard var session = sessions[sessionId], timestamp >= session.todosAt else { return }
        session.todos = todos
        session.todosAt = timestamp
        sessions[sessionId] = session
    }

    public mutating func prune(now: Date, calendar: Calendar = .current) {
        let cutoff = dayStart(now, daysBack: keptDays - 1, calendar: calendar)
        cells = cells.filter { $0.key.hour >= cutoff }
        sessions = sessions.filter { $0.value.lastAt >= cutoff }
        ids = ids.filter { $0.value.at >= cutoff }
    }

    public func summary(_ period: Period, now: Date, calendar: Calendar = .current) -> ConsumptionSummary {
        let usage = cells.map { key, counts in
            UsageCell(
                hour: key.hour, model: key.model, project: key.project, session: key.session,
                input: counts.input, output: counts.output, cacheRead: counts.cacheRead
            )
        }
        return summarize(usage, period: period, now: now, groups: claudeModels, calendar: calendar)
    }

    public func session(_ id: String) -> SessionStats? {
        guard let found = sessions[id] else { return nil }
        return SessionStats(
            tokens: found.tokens, model: found.model, contextTokens: found.contextTokens, branch: found.branch,
            startedAt: found.startedAt, lastAt: found.lastAt, todos: found.todos
        )
    }
}

private func milliseconds(_ date: Date) -> JSONValue {
    .number((date.timeIntervalSince1970 * 1000).rounded())
}

private func date(_ value: JSONValue?) -> Date? {
    guard case let .number(number)? = value, number.isFinite else { return nil }
    return Date(timeIntervalSince1970: number / 1000)
}

private func whole(_ value: JSONValue?) -> Int? {
    guard case let .number(number)? = value, number.isFinite else { return nil }
    return Int(number)
}

extension ClaudeIndex {
    public func toJSON() -> JSONValue {
        let orderedCells = cells.sorted {
            ($0.key.hour, $0.key.model, $0.key.project, $0.key.session) < ($1.key.hour, $1.key.model, $1.key.project, $1.key.session)
        }
        let cellValues = orderedCells.map { key, counts -> JSONValue in
            .object([
                "hour": milliseconds(key.hour), "model": .string(key.model), "project": .string(key.project), "session": .string(key.session),
                "input": .number(Double(counts.input)), "output": .number(Double(counts.output)), "cacheRead": .number(Double(counts.cacheRead)),
            ])
        }
        let sessionValues = sessions.sorted { $0.key < $1.key }.map { id, session -> JSONValue in
            .object([
                "id": .string(id), "tokens": .number(Double(session.tokens)), "model": .string(session.model),
                "contextTokens": .number(Double(session.contextTokens)), "branch": session.branch.map(JSONValue.string) ?? .null,
                "startedAt": milliseconds(session.startedAt), "lastAt": milliseconds(session.lastAt),
                "todos": session.todos.map { .object(["done": .number(Double($0.done)), "total": .number(Double($0.total))]) } ?? .null,
                "todosAt": milliseconds(session.todosAt), "mainAt": milliseconds(session.mainAt),
            ])
        }
        let idValues = ids.mapValues { JSONValue.object(["at": milliseconds($0.at), "output": .number(Double($0.output))]) }
        return .object(["version": .number(indexVersion), "cells": .array(cellValues), "sessions": .array(sessionValues), "ids": .object(idValues)])
    }

    public init(json: JSONValue?) {
        self.init()
        guard let json, json.field("version")?.finiteNumber == indexVersion, let cellList = json.field("cells")?.array,
            let sessionList = json.field("sessions")?.array, let idMap = json.field("ids")?.object
        else { return }
        var loaded = ClaudeIndex()
        for item in cellList {
            guard let hour = date(item.field("hour")), let model = item.field("model")?.string, let project = item.field("project")?.string,
                let session = item.field("session")?.string, let input = whole(item.field("input")), let output = whole(item.field("output")),
                let cacheRead = whole(item.field("cacheRead"))
            else { return }
            loaded.cells[CellKey(hour: hour, model: model, project: project, session: session)] = Counts(input: input, output: output, cacheRead: cacheRead)
        }
        for item in sessionList {
            guard let id = item.field("id")?.string, let tokens = whole(item.field("tokens")), let model = item.field("model")?.string,
                let contextTokens = whole(item.field("contextTokens")), let startedAt = date(item.field("startedAt")),
                let lastAt = date(item.field("lastAt")), let todosAt = date(item.field("todosAt")), let mainAt = date(item.field("mainAt"))
            else { return }
            var branch: String?
            switch item.field("branch") {
            case .null?: branch = nil
            case let .string(text)?: branch = text
            default: return
            }
            var todos: TodoProgress?
            switch item.field("todos") {
            case .null?: todos = nil
            case let value?:
                guard let done = whole(value.field("done")), let total = whole(value.field("total")) else { return }
                todos = TodoProgress(done: done, total: total)
            default: return
            }
            loaded.sessions[id] = SessionRecord(
                tokens: tokens, model: model, contextTokens: contextTokens, branch: branch, startedAt: startedAt, lastAt: lastAt,
                todos: todos, todosAt: todosAt, mainAt: mainAt
            )
        }
        for (id, value) in idMap {
            guard let at = date(value.field("at")), let output = whole(value.field("output")) else { return }
            loaded.ids[id] = Seen(at: at, output: output)
        }
        self = loaded
    }
}
