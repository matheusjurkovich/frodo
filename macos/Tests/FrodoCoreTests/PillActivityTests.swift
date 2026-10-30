import CoreGraphics
import Foundation
import Testing

@testable import FrodoCore

private let notification = PillActivity.notification(InterceptedNotification(app: "app", title: "t", body: "b"))
private let working = PillActivity.claudeWorking(session: makeSession("a"))
private let permission = PillActivity.claudePermission(session: makeSession("a", status: .waiting), request: makeRequest("a.1"))
private let waiting = PillActivity.claudeWaiting(session: makeSession("a", status: .waiting))
private let meeting = PillActivity.meeting(title: "Daily", startsAt: referenceDate)
private let media = PillActivity.media(makeTrack("t"))
private let recording = PillActivity.recording(startedAt: referenceDate)
private let volume = PillActivity.volume(percent: 40)

@Suite("atividade da pílula")
struct PillActivityTests {
    @Test("notificação abre a aba Notificações e sessão trabalhando abre a aba Claude")
    func notificationAndWorkingSessionOpenTheirTab() {
        #expect(notification.clickTab == .notifications)
        #expect(working.clickTab == .claude)
    }

    @Test("atividades sem aba própria não indicam aba")
    func activitiesWithoutATabIndicateNone() {
        for activity in [permission, waiting, meeting, media, recording, volume] {
            #expect(activity.clickTab == nil)
        }
    }

    @Test("atividades com botão de ação não abrem a ilha ao passar o mouse")
    func activitiesWithButtonsBlockHoverOpening() {
        for activity in [permission, waiting, meeting, media, recording] {
            #expect(activity.hasAction)
        }
    }

    @Test("notificação, volume e sessão trabalhando não têm botão de ação")
    func activitiesWithoutButtonsAllowHoverOpening() {
        for activity in [notification, volume, working] {
            #expect(!activity.hasAction)
        }
    }
}

@Suite("região de hover da pílula")
struct HoverRegionTests {
    @Test("em cima e embaixo a faixa é larga e baixa")
    func topAndBottomStripsAreWideAndShort() {
        for position in [IslandPosition.topLeft, .topCenter, .topRight, .bottomLeft, .bottomCenter, .bottomRight] {
            let region = islandHoverRegion(position: position)
            #expect(region.width > region.height)
        }
    }

    @Test("nas laterais a faixa é alta e estreita")
    func sideStripsAreTallAndNarrow() {
        for position in [IslandPosition.middleLeft, .middleRight] {
            let region = islandHoverRegion(position: position)
            #expect(region.height > region.width)
        }
    }
}
