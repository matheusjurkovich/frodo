import Foundation

private func shortLabel(_ window: UsageWindow) -> String {
    switch window.role {
    case .session: "Sessão 5 h"
    case .weekly: "Semana"
    case .scoped, .other: window.label
    }
}

public func claudeMeters(_ windows: [UsageWindow], now: Date) -> [Meter] {
    windows
        .filter { $0.role == .session || $0.role == .weekly }
        .map { window in
            Meter(
                key: window.role == .session ? "session" : "weekly",
                label: window.label,
                short: shortLabel(window),
                percent: window.utilization,
                note: window.resetsAt.flatMap(parseISODate).map { resetNote($0, now: now) } ?? ""
            )
        }
}
