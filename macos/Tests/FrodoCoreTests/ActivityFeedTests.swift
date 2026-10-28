import Foundation
import Testing

@testable import FrodoCore

@MainActor
private final class FakeRecording: RecordingSource {
    private(set) var startedAt: Date?
    let changed = Event<Void>()

    func set(_ startedAt: Date?) {
        self.startedAt = startedAt
        changed.emit()
    }
}

@MainActor
private final class FakeSessions: SessionsSource {
    private(set) var sessions: [SessionState] = []
    private(set) var pending: [PendingRequest] = []
    let changed = Event<Void>()

    func set(_ sessions: [SessionState], pending: [PendingRequest] = []) {
        self.sessions = sessions
        self.pending = pending
        changed.emit()
    }
}

@MainActor
private final class FakeMeetings: MeetingsSource {
    private(set) var next: Meeting?
    let changed = Event<Void>()

    func set(_ next: Meeting?) {
        self.next = next
        changed.emit()
    }
}

@MainActor
private final class FakeNotifications: NotificationsSource {
    let intercepted = Event<InterceptedNotification>()

    func push(_ title: String) {
        intercepted.emit(InterceptedNotification(app: "app", title: title, body: ""))
    }
}

@MainActor
private final class FakeVolume: VolumeSource {
    let changed = Event<Int>()

    func set(_ percent: Int) {
        changed.emit(percent)
    }
}

@MainActor
private final class FakeMedia: MediaSource {
    private(set) var current: MediaTrack?
    let changed = Event<Void>()

    func set(_ current: MediaTrack?) {
        self.current = current
        changed.emit()
    }
}

@MainActor
private final class Harness {
    let scheduler = ManualScheduler()
    let recording = FakeRecording()
    let sessions = FakeSessions()
    let meetings = FakeMeetings()
    let notifications = FakeNotifications()
    let volume = FakeVolume()
    let media = FakeMedia()
    let feed: ActivityFeed
    private(set) var changes = 0

    init() {
        feed = ActivityFeed(sources: Harness.sources(recording, sessions, meetings, notifications, volume, media), scheduler: scheduler)
        _ = feed.changed.on { [weak self] _ in self?.changes += 1 }
    }

    func newFeed() -> ActivityFeed {
        ActivityFeed(sources: Harness.sources(recording, sessions, meetings, notifications, volume, media), scheduler: scheduler)
    }

    var notificationTitle: String? {
        guard case let .notification(item)? = feed.current else { return nil }
        return item.title
    }

    var permissionKey: String? {
        guard case let .claudePermission(_, request)? = feed.current else { return nil }
        return request.key
    }

    private static func sources(
        _ recording: FakeRecording,
        _ sessions: FakeSessions,
        _ meetings: FakeMeetings,
        _ notifications: FakeNotifications,
        _ volume: FakeVolume,
        _ media: FakeMedia
    ) -> FeedSources {
        FeedSources(recording: recording, sessions: sessions, meetings: meetings, notifications: notifications, volume: volume, media: media)
    }
}

private func session(_ id: String, _ status: SessionStatus, step: String = "", tool: String? = nil) -> SessionState {
    makeSession(id, step: step, status: status, tool: tool, updatedAt: Date())
}

private func request(_ sessionId: String, _ name: String, since: TimeInterval) -> PendingRequest {
    PendingRequest(key: "\(sessionId).\(name)", sessionId: sessionId, request: name, pid: 1, tool: "Bash", since: Date(timeIntervalSince1970: since))
}

private func track(playing: Bool, title: String = "t") -> MediaTrack {
    MediaTrack(title: title, artist: "a", app: "p", playing: playing)
}

private func moment(_ seconds: TimeInterval) -> Date {
    Date(timeIntervalSince1970: seconds)
}

@MainActor
@Suite("ActivityFeed")
struct ActivityFeedTests {
    @Test("sem fontes ativas fica no repouso")
    func idleWithoutActiveSources() {
        let h = Harness()
        defer { h.feed.destroy() }
        #expect(h.feed.current == nil)
    }

    @Test("gravação vence o resto e devolve a vez ao parar")
    func recordingWinsAndGivesTurnBackOnStop() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.media.set(track(playing: true))
        h.recording.set(moment(1000))
        #expect(h.feed.current == .recording(startedAt: moment(1000)))
        h.recording.set(nil)
        #expect(h.feed.current?.kind == .media)
        #expect(h.changes == 3)
    }

    @Test("sessões entram pelo status e ignoram as concluídas")
    func sessionsEnterByStatusAndIgnoreDone() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([session("a", .done), session("b", .working, step: "Bash ls", tool: "Bash")])
        #expect(h.feed.current?.kind == .claudeWorking)
        h.sessions.set([session("a", .done), session("b", .working, step: "Bash ls", tool: "Bash"), session("c", .waiting)])
        #expect(h.feed.current?.kind == .claudeWaiting)
        h.sessions.set([session("a", .done)])
        #expect(h.feed.current == nil)
    }

    @Test("pedido pendente vira pedido de permissão com botões")
    func pendingRequestBecomesPermissionRequest() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([session("a", .waiting)], pending: [request("a", "r1", since: 10)])
        #expect(h.feed.current?.kind == .claudePermission)
        #expect(h.permissionKey == "a.r1")
    }

    @Test("com vários pedidos vence o mais antigo")
    func oldestRequestWinsAmongSeveral() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([session("a", .waiting), session("b", .waiting)], pending: [request("a", "r1", since: 20), request("b", "r2", since: 10)])
        #expect(h.permissionKey == "b.r2")
    }

    @Test("sessão esperando sem pedido continua só com Abrir")
    func waitingSessionWithoutRequestKeepsOnlyOpen() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([session("a", .waiting)])
        #expect(h.feed.current?.kind == .claudeWaiting)
    }

    @Test("pedido de sessão desconhecida é ignorado")
    func requestFromUnknownSessionIsIgnored() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([], pending: [request("x", "r1", since: 10)])
        #expect(h.feed.current == nil)
    }

    @Test("só emite quando o conteúdo muda")
    func emitsOnlyWhenContentChanges() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([session("a", .working, step: "Bash ls", tool: "Bash")])
        h.sessions.set([session("a", .working, step: "Bash ls", tool: "Bash")])
        #expect(h.changes == 1)
        h.sessions.set([session("a", .working, step: "Edit x", tool: "Edit")])
        #expect(h.changes == 2)
    }

    @Test("Claude trabalhando aparece 5 s a cada ferramenta nova e some")
    func claudeWorkingShowsFiveSecondsPerNewTool() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([session("a", .working, step: "Bash ls", tool: "Bash")])
        #expect(h.feed.current?.kind == .claudeWorking)
        #expect(h.scheduler.history == [5])
        h.scheduler.fire(5)
        #expect(h.feed.current == nil)
        h.sessions.set([session("a", .working, step: "Bash ls", tool: "Bash")])
        #expect(h.feed.current == nil)
        h.sessions.set([session("a", .working, step: "Edit x", tool: "Edit")])
        #expect(h.feed.current?.kind == .claudeWorking)
        #expect(h.scheduler.history == [5, 5])
    }

    @Test("Claude pensando, sem ferramenta, não aparece")
    func claudeThinkingWithoutToolDoesNotShow() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([session("a", .working, step: "Pensando")])
        #expect(h.feed.current == nil)
        #expect(h.scheduler.armedIntervals.isEmpty)
    }

    @Test("sessão que já trabalhava ao ligar não pisca")
    func sessionAlreadyWorkingAtStartDoesNotFlash() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([session("a", .working, step: "Bash ls", tool: "Bash")])
        let later = h.newFeed()
        defer { later.destroy() }
        #expect(later.current == nil)
    }

    @Test("mídia só entra tocando")
    func mediaEntersOnlyWhenPlaying() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.media.set(track(playing: false))
        #expect(h.feed.current == nil)
        h.media.set(track(playing: true))
        #expect(h.feed.current?.kind == .media)
    }

    @Test("mídia aparece 5 s ao começar a tocar e some")
    func mediaShowsFiveSecondsWhenStartingAndFades() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.media.set(track(playing: true))
        #expect(h.scheduler.history == [5])
        h.scheduler.fire(5)
        #expect(h.feed.current == nil)
        h.media.set(track(playing: true))
        #expect(h.feed.current == nil)
        #expect(h.scheduler.armedIntervals.isEmpty)
    }

    @Test("mídia volta a aparecer ao retomar ou trocar de faixa")
    func mediaReturnsOnResumeOrTrackChange() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.media.set(track(playing: true))
        h.scheduler.fire(5)
        h.media.set(track(playing: false))
        h.media.set(track(playing: true))
        #expect(h.feed.current?.kind == .media)
        h.scheduler.fire(5)
        h.media.set(track(playing: true, title: "outra"))
        #expect(h.feed.current?.kind == .media)
    }

    @Test("mídia que já tocava ao ligar não aparece")
    func mediaAlreadyPlayingAtStartDoesNotShow() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.media.set(track(playing: true))
        let later = h.newFeed()
        defer { later.destroy() }
        #expect(later.current == nil)
    }

    @Test("notificação vence a reunião e a gravação")
    func notificationBeatsMeetingAndRecording() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.meetings.set(Meeting(title: "Daily", startsAt: moment(5000)))
        h.recording.set(moment(1000))
        h.notifications.push("Oi")
        #expect(h.notificationTitle == "Oi")
        h.scheduler.fire(3)
        #expect(h.feed.current == .recording(startedAt: moment(1000)))
    }

    @Test("a fila de notificações avança de 3 s em 3 s e recomeça depois de esvaziar")
    func notificationQueueAdvancesEveryThreeSecondsAndRestartsAfterEmptying() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.notifications.push("a")
        #expect(h.scheduler.history == [3])
        h.notifications.push("b")
        #expect(h.scheduler.history == [3])
        #expect(h.notificationTitle == "a")
        h.scheduler.fire(3)
        #expect(h.notificationTitle == "b")
        #expect(h.scheduler.history == [3, 3])
        h.scheduler.fire(3)
        #expect(h.feed.current == nil)
        #expect(h.scheduler.armedIntervals.isEmpty)
        h.notifications.push("c")
        #expect(h.notificationTitle == "c")
        #expect(h.scheduler.history == [3, 3, 3])
        #expect(h.changes == 4)
    }

    @Test("o volume some em 1,5 s e rearma a cada mudança")
    func volumeFadesAfterOneAndHalfSecondsAndRearmsOnEveryChange() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.volume.set(40)
        h.volume.set(55)
        #expect(h.scheduler.history == [1.5, 1.5])
        h.scheduler.fire(1.5)
        #expect(h.feed.current == nil)
        h.volume.set(55)
        #expect(h.feed.current == .volume(percent: 55))
        #expect(h.scheduler.history == [1.5, 1.5, 1.5])
    }

    @Test("notificação e volume têm relógios independentes")
    func notificationAndVolumeHaveIndependentClocks() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.notifications.push("a")
        h.volume.set(40)
        #expect(h.scheduler.history == [3, 1.5])
        #expect(h.feed.current?.kind == .notification)
        h.scheduler.fire(3)
        #expect(h.feed.current == .volume(percent: 40))
        h.scheduler.fire(1.5)
        #expect(h.feed.current == nil)
    }

    @Test("cancelTransient para os relógios e descarta a fila")
    func cancelTransientStopsClocksAndDiscardsQueue() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.notifications.push("a")
        h.notifications.push("b")
        h.volume.set(40)
        h.media.set(track(playing: true))
        #expect(h.feed.current?.kind == .notification)
        h.feed.cancelTransient()
        #expect(h.feed.current == nil)
        #expect(h.scheduler.armedIntervals.isEmpty)
        h.notifications.push("c")
        #expect(h.notificationTitle == "c")
        h.scheduler.fire(3)
        #expect(h.feed.current == nil)
    }

    @Test("volume mostra a porcentagem e acompanha o deslize")
    func volumeShowsPercentageAndFollowsTheSlider() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.volume.set(40)
        h.volume.set(40)
        h.volume.set(55)
        #expect(h.feed.current == .volume(percent: 55))
        #expect(h.changes == 2)
    }

    @Test("destroy para os relógios armados")
    func destroyStopsArmedClocks() {
        let h = Harness()
        h.notifications.push("a")
        h.volume.set(40)
        #expect(h.scheduler.armedIntervals.count == 2)
        h.feed.destroy()
        #expect(h.scheduler.armedIntervals.isEmpty)
    }

    @Test("destroy desfaz as assinaturas de todas as fontes")
    func destroyUndoesSubscriptionsOfAllSources() {
        let h = Harness()
        h.feed.destroy()
        h.recording.set(moment(1))
        h.sessions.set([session("a", .working)])
        h.meetings.set(Meeting(title: "Daily", startsAt: moment(5000)))
        h.media.set(track(playing: true))
        h.notifications.push("b")
        h.volume.set(10)
        #expect(h.feed.current == nil)
        #expect(h.scheduler.history.isEmpty)
        #expect(h.changes == 0)
    }

    @Test("gravação aparece por 5 s e some até começar outra")
    func recordingShowsFiveSecondsAndFadesUntilAnotherStarts() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.recording.set(moment(1000))
        #expect(h.scheduler.history == [5])
        h.scheduler.fire(5)
        #expect(h.feed.current == nil)
        h.recording.set(nil)
        h.recording.set(moment(2000))
        #expect(h.feed.current == .recording(startedAt: moment(2000)))
    }

    @Test("reunião aparece por 5 s e não volta")
    func meetingShowsFiveSecondsAndDoesNotReturn() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.meetings.set(Meeting(title: "Daily", startsAt: moment(5000)))
        h.scheduler.fire(5)
        #expect(h.feed.current == nil)
        h.meetings.set(Meeting(title: "Daily", startsAt: moment(5000)))
        #expect(h.feed.current == nil)
    }

    @Test("pedido de permissão aparece por 5 s e cede a vez ao próximo")
    func permissionRequestShowsFiveSecondsAndYieldsToTheNext() {
        let h = Harness()
        defer { h.feed.destroy() }
        let waiting = session("b", .waiting)
        h.sessions.set([session("a", .waiting), waiting], pending: [request("a", "r1", since: 10)])
        #expect(h.feed.current?.kind == .claudePermission)
        h.scheduler.fire(5)
        #expect(h.feed.current == .claudeWaiting(session: waiting))
        h.scheduler.fire(5)
        #expect(h.feed.current == nil)
    }

    @Test("atividade interrompida volta com 5 s inteiros")
    func interruptedActivityReturnsWithFullFiveSeconds() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.recording.set(moment(1000))
        h.notifications.push("Oi")
        h.scheduler.fire(3)
        #expect(h.feed.current?.kind == .recording)
        #expect(h.scheduler.history == [5, 3, 5])
    }

    @Test("abrir a ilha dá como vista a gravação em andamento")
    func openingTheIslandMarksOngoingRecordingAsSeen() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.recording.set(moment(1000))
        h.feed.cancelTransient()
        #expect(h.feed.current == nil)
        #expect(h.scheduler.armedIntervals.isEmpty)
    }
}
