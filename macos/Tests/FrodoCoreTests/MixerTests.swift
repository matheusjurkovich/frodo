import Testing

@testable import FrodoCore

@Suite("mixer")
struct MixerTests {
    @Test("mostra porcentagem ou mudo")
    func showsPercentOrMuted() {
        #expect(volumeLabel(level: 0.746, muted: false) == "75%")
        #expect(volumeLabel(level: 0.746, muted: true) == "Mudo")
    }

    @Test("resume quantos apps tocam")
    func summarizesPlayingApps() {
        #expect(playingSummary(0) == "Nada tocando")
        #expect(playingSummary(1) == "1 tocando")
        #expect(playingSummary(3) == "3 tocando")
    }
}
