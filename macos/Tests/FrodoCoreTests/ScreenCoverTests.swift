import CoreGraphics
import Testing

@testable import FrodoCore

private let screen = CGRect(x: 0, y: 0, width: 1710, height: 1112)
private let visible = CGRect(x: 0, y: 38, width: 1710, height: 1046)

@Suite("screenCover")
struct ScreenCoverTests {
    @Test("sem janelas a tela está livre")
    func noWindowsMeansNoCover() {
        #expect(screenCover(windows: [], screen: screen, visible: visible) == .none)
    }

    @Test("janela do tamanho da tela é tela cheia")
    func aScreenSizedWindowIsFullscreen() {
        #expect(screenCover(windows: [screen], screen: screen, visible: visible) == .fullscreen)
    }

    @Test("janela que preenche a área útil é maximizada")
    func aWindowFillingTheVisibleFrameIsMaximized() {
        #expect(screenCover(windows: [visible], screen: screen, visible: visible) == .maximized)
    }

    @Test("janela menor que a área útil não cobre")
    func aSmallerWindowCoversNothing() {
        let window = CGRect(x: 100, y: 100, width: 900, height: 600)
        #expect(screenCover(windows: [window], screen: screen, visible: visible) == .none)
    }

    @Test("janela encaixada na metade não cobre")
    func aHalfTiledWindowCoversNothing() {
        let half = CGRect(x: 0, y: 38, width: 855, height: 1046)
        #expect(screenCover(windows: [half], screen: screen, visible: visible) == .none)
    }

    @Test("aceita uma folga de poucos pontos nas bordas")
    func acceptsASmallSlackOnTheEdges() {
        let nearlyVisible = CGRect(x: 1, y: 39, width: 1708, height: 1044)
        #expect(screenCover(windows: [nearlyVisible], screen: screen, visible: visible) == .maximized)
    }

    @Test("faltando bastante da altura já não é maximizada")
    func missingMostOfTheHeightIsNotMaximized() {
        let short = CGRect(x: 0, y: 38, width: 1710, height: 1000)
        #expect(screenCover(windows: [short], screen: screen, visible: visible) == .none)
    }

    @Test("tela cheia vence a maximizada quando há as duas")
    func fullscreenWinsOverMaximized() {
        #expect(screenCover(windows: [visible, screen], screen: screen, visible: visible) == .fullscreen)
    }

    @Test("área útil que já é a tela inteira (barra de menus escondida) conta como tela cheia")
    func aVisibleFrameEqualToTheScreenCountsAsFullscreen() {
        #expect(screenCover(windows: [screen], screen: screen, visible: screen) == .fullscreen)
    }
}

@Suite("pillPresence")
struct PillPresenceTests {
    @Test("sem cobertura a pílula fica à mostra")
    func withoutCoverThePillShows() {
        #expect(pillPresence(cover: .none, alwaysShow: false, activity: nil, peeking: false) == .pill)
        #expect(pillPresence(cover: .none, alwaysShow: false, activity: .media, peeking: false) == .pill)
    }

    @Test("janela maximizada vira lingueta")
    func aMaximizedWindowTurnsThePillIntoATongue() {
        #expect(pillPresence(cover: .maximized, alwaysShow: false, activity: nil, peeking: false) == .tongue)
    }

    @Test("sempre à mostra mantém a pílula com janela maximizada")
    func alwaysShowKeepsThePillOverAMaximizedWindow() {
        #expect(pillPresence(cover: .maximized, alwaysShow: true, activity: nil, peeking: false) == .pill)
    }

    @Test("tela cheia esconde a pílula e a lingueta")
    func fullscreenHidesBothThePillAndTheTongue() {
        #expect(pillPresence(cover: .fullscreen, alwaysShow: false, activity: nil, peeking: false) == .hidden)
    }

    @Test("sempre à mostra não vale em tela cheia")
    func alwaysShowDoesNotApplyInFullscreen() {
        #expect(pillPresence(cover: .fullscreen, alwaysShow: true, activity: nil, peeking: false) == .hidden)
    }

    @Test("atividade comum não fura a cobertura")
    func ordinaryActivityDoesNotBreakThroughTheCover() {
        for kind in [ActivityKind.media, .volume, .claudeWorking, .meeting, .recording] {
            #expect(pillPresence(cover: .maximized, alwaysShow: false, activity: kind, peeking: false) == .tongue)
            #expect(pillPresence(cover: .fullscreen, alwaysShow: false, activity: kind, peeking: false) == .hidden)
        }
    }

    @Test("permissão e espera do Claude aparecem mesmo em tela cheia")
    func claudePermissionAndWaitingShowEvenInFullscreen() {
        for kind in [ActivityKind.claudePermission, .claudeWaiting] {
            #expect(pillPresence(cover: .fullscreen, alwaysShow: false, activity: kind, peeking: false) == .pill)
            #expect(pillPresence(cover: .maximized, alwaysShow: false, activity: kind, peeking: false) == .pill)
        }
    }

    @Test("notificação aparece com janela maximizada, mas não em tela cheia")
    func notificationShowsOverAMaximizedWindowButNotInFullscreen() {
        #expect(pillPresence(cover: .maximized, alwaysShow: false, activity: .notification, peeking: false) == .pill)
        #expect(pillPresence(cover: .fullscreen, alwaysShow: false, activity: .notification, peeking: false) == .hidden)
    }

    @Test("a espiada da hora mostra a pílula em tela cheia")
    func thePeekShowsThePillInFullscreen() {
        #expect(pillPresence(cover: .fullscreen, alwaysShow: false, activity: nil, peeking: true) == .pill)
    }

    @Test("cobertura só esconde quando a regra manda")
    func coverOnlyHidesWhenTheRuleSaysSo() {
        #expect(!pillCovered(.none, alwaysShow: false))
        #expect(pillCovered(.maximized, alwaysShow: false))
        #expect(!pillCovered(.maximized, alwaysShow: true))
        #expect(pillCovered(.fullscreen, alwaysShow: true))
    }
}
