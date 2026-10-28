import Foundation
import Testing

@testable import FrodoCore

private func working(_ id: String, step: String = "") -> PillActivity {
    .claudeWorking(session: makeSession(id, step: step))
}

@Suite("sameSubject")
struct ActivitySubjectTests {
    @Test("ocioso com ocioso é o mesmo assunto")
    func idleWithIdleIsSameSubject() {
        #expect(sameSubject(nil, nil))
    }

    @Test("ocioso com atividade muda de assunto")
    func idleWithActivityChangesSubject() {
        #expect(!sameSubject(nil, .volume(percent: 30)))
    }

    @Test("tipos diferentes da mesma sessão mudam de assunto")
    func differentKindsChangeSubject() {
        #expect(!sameSubject(.claudeWaiting(session: makeSession("a")), working("a")))
    }

    @Test("volume e gravação mudam no lugar")
    func volumeAndRecordingChangeInPlace() {
        #expect(sameSubject(.volume(percent: 30), .volume(percent: 31)))
        #expect(sameSubject(.recording(startedAt: Date(timeIntervalSince1970: 1)), .recording(startedAt: Date(timeIntervalSince1970: 2))))
    }

    @Test("passo novo do claude na mesma sessão muda no lugar")
    func newStepInSameSessionChangesInPlace() {
        #expect(sameSubject(working("a", step: "Read"), working("a", step: "Bash")))
        #expect(!sameSubject(working("a"), working("b")))
    }

    @Test("outro pedido de permissão muda de assunto")
    func anotherPermissionRequestChangesSubject() {
        func ask(_ key: String) -> PillActivity {
            .claudePermission(session: makeSession("a"), request: makeRequest(key))
        }
        #expect(sameSubject(ask("a.1"), ask("a.1")))
        #expect(!sameSubject(ask("a.1"), ask("a.2")))
    }

    @Test("reunião compara título e horário")
    func meetingComparesTitleAndTime() {
        let start = Date(timeIntervalSince1970: 1)
        #expect(sameSubject(.meeting(title: "x", startsAt: start), .meeting(title: "x", startsAt: start)))
        #expect(!sameSubject(.meeting(title: "x", startsAt: start), .meeting(title: "x", startsAt: Date(timeIntervalSince1970: 2))))
    }

    @Test("notificação compara o próprio item")
    func notificationComparesItself() {
        let first = makeNotification("oi")
        #expect(sameSubject(.notification(first), .notification(first)))
        #expect(!sameSubject(.notification(first), .notification(makeNotification("oi"))))
    }

    @Test("música troca de assunto só com outra faixa")
    func musicChangesSubjectOnlyWithAnotherTrack() {
        #expect(sameSubject(.media(makeTrack("t", coverUrl: "a.png")), .media(makeTrack("t", coverUrl: "b.png"))))
        #expect(!sameSubject(.media(makeTrack("t")), .media(makeTrack("u"))))
    }
}
