import Foundation
import Testing

@testable import FrodoCore

private let now = utc(2026, 10, 27, 12, 0)


@Suite("format")
struct FormatTests {
    @Test("formata data curta")
    func formatsShortDate() {
        #expect(formatDate(localDate(2026, 10, 24)) == "Sáb, 24 out")
        #expect(formatDate(localDate(2026, 10, 27)) == "Ter, 27 out")
    }

    @Test("corta textos longos")
    func truncatesLongText() {
        #expect(ellipsize("abc", max: 40) == "abc")
        #expect(ellipsize(String(repeating: "a", count: 45), max: 40) == String(repeating: "a", count: 39) + "…")
    }

    @Test("tokens em pt-BR compacto")
    func compactTokensInPortuguese() {
        let formatted = [940, 612_000, 148_400, 999_600, 4_100_000, 27_000_000, 1_240_000_000].map(formatTokens)
        #expect(formatted == ["940", "612 mil", "148 mil", "1 mi", "4,1 mi", "27 mi", "1,2 bi"])
    }

    @Test("cronômetro de faixa e gravação")
    func timerForTrackAndRecording() {
        #expect([0, 84, 232, 3725].map { formatTimer(Double($0)) } == ["0:00", "1:24", "3:52", "1:02:05"])
    }

    @Test("há quanto tempo")
    func howLongAgo() {
        let offsets: [TimeInterval] = [30, 9 * 60, 2 * 3600, 3 * 86400]
        #expect(offsets.map { formatAgo(now.addingTimeInterval(-$0), now: now) } == ["agora", "9 min", "2 h", "3 d"])
    }

    @Test("quanto falta")
    func howLongUntil() {
        let starts = [now.addingTimeInterval(5 * 60), now.addingTimeInterval(4 * 60 + 10), now, now.addingTimeInterval(-60)]
        #expect(starts.map { formatUntil($0, now: now) } == ["Em 5 min", "Em 5 min", "Agora", "Agora"])
    }

    @Test("duração de sessão")
    func sessionDuration() {
        #expect([30, 240, 3840].map { formatSpan(Double($0)) } == ["1 min", "4 min", "1 h 04 min"])
    }

    @Test("segundos desde o início, nunca negativos nem NaN")
    func secondsSinceNeverNegativeNorNaN() {
        let moments = [
            now.addingTimeInterval(-84), now, now.addingTimeInterval(5),
            Date(timeIntervalSince1970: .nan), Date(timeIntervalSince1970: .infinity),
        ]
        #expect(moments.map { secondsSince($0, now: now) } == [84, 0, 0, 0, 0])
        #expect(formatTimer(secondsSince(now.addingTimeInterval(5), now: now)) == "0:00")
        #expect(formatTimer(secondsSince(Date(timeIntervalSince1970: .nan), now: now)) == "0:00")
    }
}
