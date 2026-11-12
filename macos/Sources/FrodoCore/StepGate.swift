import Foundation

public let stepShownSeconds: TimeInterval = 3
public let stepQuietSeconds: TimeInterval = 10

public final class StepGate {
    private struct Entry {
        let step: String
        let admitted: Bool
        var shownAt: Date?
    }

    private var sessions: [String: Entry] = [:]

    public init() {}

    public func admits(_ sessionId: String, step: String, now: Date) -> Bool {
        let entry = sessions[sessionId]
        if let entry, entry.step == step { return entry.admitted }
        let shownAt = entry?.shownAt
        let admitted = shownAt.map { now.timeIntervalSince($0) >= stepQuietSeconds } ?? true
        sessions[sessionId] = Entry(step: step, admitted: admitted, shownAt: shownAt)
        return admitted
    }

    public func shown(_ sessionId: String, now: Date) {
        sessions[sessionId]?.shownAt = now
    }

    public func retain(_ ids: Set<String>) {
        sessions = sessions.filter { ids.contains($0.key) }
    }
}
