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
private final class FeedClock {
    var now = Date(timeIntervalSince1970: 1_000_000)
    var mode = PillAiActivity.change
}

@MainActor
private final class Harness {
    let scheduler = ManualScheduler()
    let clock = FeedClock()
    let recording = FakeRecording()
    let sessions = FakeSessions()
    let meetings = FakeMeetings()
    let notifications = FakeNotifications()
    let volume = FakeVolume()
    let media = FakeMedia()
    let feed: ActivityFeed
    private(set) var changes = 0

    init(mode: PillAiActivity = .change) {
        clock.mode = mode
        feed = Harness.feed(recording, sessions, meetings, notifications, volume, media, clock, scheduler)
        _ = feed.changed.on { [weak self] _ in self?.changes += 1 }
    }

    func newFeed() -> ActivityFeed {
        Harness.feed(recording, sessions, meetings, notifications, volume, media, clock, scheduler)
    }

    func setMode(_ mode: PillAiActivity) {
        clock.mode = mode
        feed.aiActivityChanged()
    }

    func advance(_ seconds: TimeInterval) {
        clock.now = clock.now.addingTimeInterval(seconds)
    }

    func session(_ id: String, _ status: SessionStatus, step: String = "", tool: String? = nil) -> SessionState {
        makeSession(id, step: step, status: status, tool: tool, updatedAt: clock.now)
    }

    var notificationTitle: String? {
        guard case let .notification(item)? = feed.current else { return nil }
        return item.title
    }

    var permissionKey: String? {
        guard case let .claudePermission(_, request)? = feed.current else { return nil }
        return request.key
    }

    var workingStep: String? {
        guard case let .claudeWorking(session)? = feed.current else { return nil }
        return session.step
    }

    var workingSession: String? {
        guard case let .claudeWorking(session)? = feed.current else { return nil }
        return session.sessionId
    }

    private static func feed(
        _ recording: FakeRecording,
        _ sessions: FakeSessions,
        _ meetings: FakeMeetings,
        _ notifications: FakeNotifications,
        _ volume: FakeVolume,
        _ media: FakeMedia,
        _ clock: FeedClock,
        _ scheduler: ManualScheduler
    ) -> ActivityFeed {
        let sources = FeedSources(
            recording: recording, sessions: sessions, meetings: meetings, notifications: notifications, volume: volume, media: media,
            aiActivity: { clock.mode }
        )
        return ActivityFeed(sources: sources, scheduler: scheduler, now: { clock.now })
    }
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
        h.sessions.set([h.session("a", .done), h.session("b", .working, step: "Bash ls", tool: "Bash")])
        #expect(h.feed.current?.kind == .claudeWorking)
        h.sessions.set([h.session("a", .done), h.session("b", .working, step: "Bash ls", tool: "Bash"), h.session("c", .waiting)])
        #expect(h.feed.current?.kind == .claudeWaiting)
        h.sessions.set([h.session("a", .done)])
        #expect(h.feed.current == nil)
    }

    @Test("pedido pendente vira pedido de permissão com botões")
    func pendingRequestBecomesPermissionRequest() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .waiting)], pending: [request("a", "r1", since: 10)])
        #expect(h.feed.current?.kind == .claudePermission)
        #expect(h.permissionKey == "a.r1")
    }

    @Test("com vários pedidos vence o mais antigo")
    func oldestRequestWinsAmongSeveral() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .waiting), h.session("b", .waiting)], pending: [request("a", "r1", since: 20), request("b", "r2", since: 10)])
        #expect(h.permissionKey == "b.r2")
    }

    @Test("sessão esperando sem pedido continua só com Abrir")
    func waitingSessionWithoutRequestKeepsOnlyOpen() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .waiting)])
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
        let h = Harness(mode: .always)
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Bash ls", tool: "Bash")])
        h.sessions.set([h.session("a", .working, step: "Bash ls", tool: "Bash")])
        #expect(h.changes == 1)
        h.sessions.set([h.session("a", .working, step: "Edit x", tool: "Edit")])
        #expect(h.changes == 2)
    }

    @Test("Claude trabalhando aparece 3 s a cada passo novo e some")
    func claudeWorkingShowsThreeSecondsPerNewStep() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Bash ls", tool: "Bash")])
        #expect(h.feed.current?.kind == .claudeWorking)
        #expect(h.scheduler.history == [3])
        h.scheduler.fire(3)
        #expect(h.feed.current == nil)
        h.sessions.set([h.session("a", .working, step: "Bash ls", tool: "Bash")])
        #expect(h.feed.current == nil)
        h.advance(10)
        h.sessions.set([h.session("a", .working, step: "Edit x", tool: "Edit")])
        #expect(h.feed.current?.kind == .claudeWorking)
        #expect(h.scheduler.history == [3, 3])
    }

    @Test("no modo ao mudar, passos dentro de 10 s não aparecem")
    func changeModeHidesStepsWithinQuietWindow() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Edit a.ts", tool: "Edit")])
        h.scheduler.fire(3)
        h.advance(5)
        h.sessions.set([h.session("a", .working, step: "Edit b.ts", tool: "Edit")])
        #expect(h.feed.current == nil)
        h.advance(6)
        h.sessions.set([h.session("a", .working, step: "Edit b.ts", tool: "Edit")])
        #expect(h.feed.current == nil)
        h.sessions.set([h.session("a", .working, step: "Edit c.ts", tool: "Edit")])
        #expect(h.workingStep == "Edit c.ts")
    }

    @Test("passo de outra sessão substitui o que está na pílula e o anterior não volta")
    func anotherSessionStepReplacesTheCurrentOne() {
        let h = Harness()
        defer { h.feed.destroy() }
        let first = h.session("s1", .working, step: "Edit a.ts", tool: "Edit")
        h.sessions.set([first])
        h.advance(1)
        h.sessions.set([first, h.session("s2", .working, step: "Edit b.ts", tool: "Edit")])
        #expect(h.workingSession == "s2")
        h.scheduler.fire(3)
        #expect(h.feed.current == nil)
    }

    @Test("no modo sempre a sessão fica enquanto trabalha e acompanha o passo")
    func alwaysModeKeepsTheSessionAndFollowsTheStep() {
        let h = Harness(mode: .always)
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Edit a.ts", tool: "Edit")])
        #expect(h.scheduler.history.isEmpty)
        h.sessions.set([h.session("a", .working, step: "Edit b.ts", tool: "Edit")])
        #expect(h.workingStep == "Edit b.ts")
    }

    @Test("no modo sempre mostra a sessão com evento mais recente")
    func alwaysModeShowsTheMostRecentSession() {
        let h = Harness(mode: .always)
        defer { h.feed.destroy() }
        let old = h.session("s1", .working, step: "Edit a.ts", tool: "Edit")
        h.advance(1)
        h.sessions.set([old, h.session("s2", .working, step: "Edit b.ts", tool: "Edit")])
        #expect(h.workingSession == "s2")
    }

    @Test("no modo sempre cancelTransient não esconde a sessão")
    func alwaysModeCancelTransientKeepsTheSession() {
        let h = Harness(mode: .always)
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Edit a.ts", tool: "Edit")])
        h.feed.cancelTransient()
        #expect(h.workingStep == "Edit a.ts")
    }

    @Test("no modo sempre a sessão que já trabalhava ao ligar aparece")
    func alwaysModeShowsSessionAlreadyWorkingAtStart() {
        let h = Harness(mode: .always)
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Bash ls", tool: "Bash")])
        let later = h.newFeed()
        defer { later.destroy() }
        #expect(later.current?.kind == .claudeWorking)
    }

    @Test("no modo nunca a IA trabalhando não aparece, mas o pedido de permissão sim")
    func neverModeHidesWorkingButKeepsPermission() {
        let h = Harness(mode: .never)
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Edit a.ts", tool: "Edit")])
        #expect(h.feed.current == nil)
        h.sessions.set([h.session("a", .waiting)], pending: [request("a", "r1", since: 10)])
        #expect(h.feed.current?.kind == .claudePermission)
    }

    @Test("no modo nunca a permissão pendente de sessão trabalhando continua aparecendo")
    func neverModeKeepsPermissionOfWorkingSession() {
        let h = Harness(mode: .never)
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Bash rm", tool: "Bash")], pending: [request("a", "r1", since: 10)])
        #expect(h.permissionKey == "a.r1")
    }

    @Test("trocar de sempre para ao mudar reavalia na hora")
    func switchingFromAlwaysToChangeReevaluatesAtOnce() {
        let h = Harness(mode: .always)
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Edit a.ts", tool: "Edit")])
        #expect(h.scheduler.history.isEmpty)
        h.setMode(.change)
        #expect(h.workingStep == "Edit a.ts")
        #expect(h.scheduler.history == [3])
    }

    @Test("no modo ao mudar, o primeiro passo de uma rajada fica 3 s inteiros")
    func changeModeKeepsTheFirstStepOfABurstForThreeSeconds() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Read a.ts", tool: "Read")])
        h.advance(0.2)
        h.sessions.set([h.session("a", .working, step: "Read b.ts", tool: "Read")])
        #expect(h.workingStep == "Read a.ts")
        h.scheduler.fire(3)
        #expect(h.feed.current == nil)
    }

    @Test("trocar para nunca tira a IA da pílula na hora")
    func switchingToNeverRemovesAiAtOnce() {
        let h = Harness(mode: .always)
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Edit a.ts", tool: "Edit")])
        let before = h.changes
        h.setMode(.never)
        #expect(h.feed.current == nil)
        #expect(h.changes == before + 1)
    }

    @Test("trocar de sempre para ao mudar com o passo recusado não deixa a pílula presa")
    func switchingBackToChangeWithRefusedStepDoesNotStick() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Edit a.ts", tool: "Edit")])
        h.scheduler.fire(3)
        h.setMode(.always)
        h.advance(1)
        h.sessions.set([h.session("a", .working, step: "Edit b.ts", tool: "Edit")])
        #expect(h.workingStep == "Edit b.ts")
        let before = h.changes
        h.setMode(.change)
        #expect(h.feed.current == nil)
        #expect(h.changes == before + 1)
    }

    @Test("sessão encerrada some da pílula")
    func endedSessionLeavesThePill() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Edit a.ts", tool: "Edit")])
        h.sessions.set([])
        #expect(h.feed.current == nil)
    }

    @Test("Claude pensando, sem ferramenta, não aparece")
    func claudeThinkingWithoutToolDoesNotShow() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Pensando")])
        #expect(h.feed.current == nil)
        #expect(h.scheduler.armedIntervals.isEmpty)
    }

    @Test("sessão que já trabalhava ao ligar não pisca")
    func sessionAlreadyWorkingAtStartDoesNotFlash() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.sessions.set([h.session("a", .working, step: "Bash ls", tool: "Bash")])
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
        h.scheduler.fire(5)
        #expect(h.feed.current == .recording(startedAt: moment(1000)))
    }

    @Test("a fila de notificações avança de 5 s em 5 s e recomeça depois de esvaziar")
    func notificationQueueAdvancesEveryThreeSecondsAndRestartsAfterEmptying() {
        let h = Harness()
        defer { h.feed.destroy() }
        h.notifications.push("a")
        #expect(h.scheduler.history == [5])
        h.notifications.push("b")
        #expect(h.scheduler.history == [5])
        #expect(h.notificationTitle == "a")
        h.scheduler.fire(5)
        #expect(h.notificationTitle == "b")
        #expect(h.scheduler.history == [5, 5])
        h.scheduler.fire(5)
        #expect(h.feed.current == nil)
        #expect(h.scheduler.armedIntervals.isEmpty)
        h.notifications.push("c")
        #expect(h.notificationTitle == "c")
        #expect(h.scheduler.history == [5, 5, 5])
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
        #expect(h.scheduler.history == [5, 1.5])
        #expect(h.feed.current?.kind == .notification)
        h.scheduler.fire(5)
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
        h.scheduler.fire(5)
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
        h.sessions.set([h.session("a", .working)])
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
        let waiting = h.session("b", .waiting)
        h.sessions.set([h.session("a", .waiting), waiting], pending: [request("a", "r1", since: 10)])
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
        h.scheduler.fire(5)
        #expect(h.feed.current?.kind == .recording)
        #expect(h.scheduler.history == [5, 5, 5])
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
