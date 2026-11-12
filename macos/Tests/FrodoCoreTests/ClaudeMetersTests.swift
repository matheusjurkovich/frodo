import Foundation
import Testing

@testable import FrodoCore

@Suite("conta e erros")
struct ClaudeMetersTests {
    @Test("resume sessão e semana como medidores")
    func summarizesSessionAndWeek() {
        let now = utc(2026, 10, 28, 12, 0)
        let reset = Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(now.addingTimeInterval(3600))
        func window(_ key: String, _ label: String, _ role: WindowRole, _ utilization: Double, _ resetsAt: String?) -> UsageWindow {
            UsageWindow(key: key, label: label, role: role, utilization: utilization, resetsAt: resetsAt, totalSeconds: nil, apiLevel: .ok, isActive: true)
        }
        let meters = claudeMeters(
            [
                window("five_hour", "Sessão atual", .session, 62, reset),
                window("opus", "Opus", .scoped, 90, nil),
                window("seven_day", "Semana", .weekly, 34, nil),
            ],
            now: now
        )
        #expect(meters.map(\.short) == ["Sessão 5 h", "Semana"])
        #expect(meters.map(\.percent) == [62, 34])
        #expect(meters.map(\.note) == ["Reinicia em 1 h", ""])
    }
}
