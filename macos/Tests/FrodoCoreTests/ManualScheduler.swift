import Foundation
import Testing

@testable import FrodoCore

@MainActor
final class ManualScheduler: Scheduler {
    private struct Entry {
        let id: Int
        var due: TimeInterval
        let interval: TimeInterval
        let repeating: Bool
        let action: @MainActor () -> Void
    }

    private var entries: [Entry] = []
    private var nextId = 0
    private(set) var now: TimeInterval = 0
    private(set) var history: [TimeInterval] = []

    var armedIntervals: [TimeInterval] {
        entries.map(\.interval)
    }

    func schedule(after interval: TimeInterval, repeating: Bool, action: @escaping @MainActor () -> Void) -> Unsubscribe {
        let id = nextId
        nextId += 1
        history.append(interval)
        entries.append(Entry(id: id, due: now + interval, interval: interval, repeating: repeating, action: action))
        return { [weak self] in
            self?.entries.removeAll { $0.id == id }
        }
    }

    func fire(_ interval: TimeInterval) {
        guard let index = entries.firstIndex(where: { $0.interval == interval }) else {
            Issue.record("nenhum timer de \(interval) s armado")
            return
        }
        let entry = entries.remove(at: index)
        entry.action()
    }

    func advance(by seconds: TimeInterval) {
        let target = now + seconds
        while let index = entries.indices.filter({ entries[$0].due <= target }).min(by: { entries[$0].due < entries[$1].due }) {
            let entry = entries[index]
            now = entry.due
            if entry.repeating {
                entries[index].due += entry.interval
            } else {
                entries.remove(at: index)
            }
            entry.action()
        }
        now = target
    }
}
