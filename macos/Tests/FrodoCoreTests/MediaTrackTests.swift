import Foundation
import Testing

@testable import FrodoCore

@Suite("mídia")
struct MediaTrackTests {
    @Test("calcula o progresso só com duração conhecida")
    func progressOnlyWithKnownDuration() {
        #expect(abs((mediaProgress(position: 84, duration: 232) ?? 0) - 0.362) < 0.001)
        #expect(mediaProgress(position: 10, duration: nil) == nil)
        #expect(mediaProgress(position: nil, duration: 100) == nil)
        #expect(mediaProgress(position: 300, duration: 100) == 1)
        #expect(mediaProgress(position: 5, duration: 0) == nil)
    }
}
