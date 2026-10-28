import Testing

@testable import FrodoCore

private struct Candidate: ActivityKinded {
    let kind: ActivityKind
    var id = ""
}

@Suite("prioridade da pílula")
struct ActivityPriorityTests {
    @Test("mostra o estado mais alto")
    func picksHighestPriority() {
        #expect(pickActivity([Candidate(kind: .media), Candidate(kind: .recording), Candidate(kind: .claudeWorking)])?.kind == .recording)
        #expect(pickActivity([Candidate(kind: .volume), Candidate(kind: .meeting)])?.kind == .meeting)
        #expect(pickActivity([Candidate(kind: .claudeWorking), Candidate(kind: .notification)])?.kind == .notification)
    }

    @Test("notificação que chega vence até a gravação")
    func notificationBeatsRecording() {
        #expect(pickActivity([Candidate(kind: .recording), Candidate(kind: .meeting), Candidate(kind: .notification)])?.kind == .notification)
    }

    @Test("pedido de permissão vence o Claude esperando e perde da gravação")
    func permissionRequestOrdering() {
        #expect(pickActivity([Candidate(kind: .claudeWaiting), Candidate(kind: .claudePermission)])?.kind == .claudePermission)
        #expect(pickActivity([Candidate(kind: .claudePermission), Candidate(kind: .recording)])?.kind == .recording)
    }

    @Test("mantém a ordem de chegada entre iguais")
    func keepsArrivalOrderAmongEquals() {
        #expect(pickActivity([Candidate(kind: .claudeWaiting, id: "a"), Candidate(kind: .claudeWaiting, id: "b")])?.id == "a")
    }

    @Test("sem atividade fica no repouso")
    func noActivityStaysIdle() {
        #expect(pickActivity([Candidate]()) == nil)
    }
}
