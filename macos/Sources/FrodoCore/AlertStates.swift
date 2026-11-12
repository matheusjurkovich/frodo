import Foundation

public struct QuotaAlertState: Sendable {
    public private(set) var levels: [String: Level] = [:]

    public init() {}

    public mutating func check(_ readings: [QuotaReading], notify: Bool) -> [AlertNotice] {
        let result = quotaNotices(levels, readings)
        levels = result.states
        return notify ? result.notices : []
    }
}

public struct DoneAlertState: Sendable {
    private var previous: [SessionState]

    public init(_ sessions: [SessionState]) {
        previous = sessions
    }

    public mutating func next(_ sessions: [SessionState], notify: Bool) -> [AlertNotice] {
        let finished = finishedSessions(previous, sessions)
        previous = sessions
        guard notify else { return [] }
        return finished.map { AlertNotice(provider: $0.provider, title: "Pronto", body: doneMessage($0)) }
    }
}

public struct MemoryAlarmState: Sendable {
    private var alarmed = false

    public init() {}

    public mutating func next(_ memory: MemoryInfo?) -> String? {
        guard let memory else { return nil }
        let next = memoryAlarm(usedPercent(memory), alarmed: alarmed)
        defer { alarmed = next }
        return next && !alarmed ? highMemoryMessage(memory) : nil
    }
}
