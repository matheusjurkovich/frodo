import Testing

@testable import FrodoCore

@Suite("abas")
struct TabsTests {
    @Test("mostra as não ocultas na ordem fixa")
    func showsNonHiddenInFixedOrder() {
        #expect(visibleTabs(hidden: []) == [.general, .calendar, .claude, .notifications, .performance, .mixer])
        #expect(visibleTabs(hidden: [.calendar, .claude]) == [.general, .notifications, .performance, .mixer])
    }

    @Test("nunca fica sem aba")
    func neverEndsWithoutTab() {
        #expect(visibleTabs(hidden: TabId.allCases) == [.general])
        #expect(visibleTabs(hidden: TabId.allCases, order: [.claude, .general]) == [.claude])
    }

    @Test("segue a ordem escolhida")
    func followsChosenOrder() {
        #expect(visibleTabs(hidden: [.calendar], order: [.notifications, .calendar, .general]) == [.notifications, .general])
    }

    @Test("completa a ordem gravada com as abas que faltam e descarta as desconhecidas")
    func completesSavedOrder() {
        #expect(orderedTabs(["claude", "velha", "general", "claude"]) == [.claude, .general, .calendar, .notifications, .performance, .mixer])
        #expect(orderedTabs([]) == TabId.allCases)
    }

    @Test("abre a primeira visível quando a pedida está oculta")
    func opensFirstVisibleWhenRequestedIsHidden() {
        #expect(tabToOpen(.claude, visible: [.general, .claude]) == .claude)
        #expect(tabToOpen(.claude, visible: [.calendar, .notifications]) == .calendar)
    }

    @Test("sem aba pedida abre a primeira visível da ordem")
    func opensFirstVisibleWithoutRequest() {
        #expect(tabToOpen(nil, visible: [.mixer, .general]) == .mixer)
        #expect(tabToOpen(nil, visible: []) == .general)
    }

    @Test("ordem com id desconhecido e repetido vira ordem válida")
    func orderSanitized() {
        #expect(orderedTabs(["mixer", "xyz", "mixer", "general"]) == [.mixer, .general, .calendar, .claude, .notifications, .performance])
    }

    @Test("todas ocultas mostra a primeira da ordem")
    func allHidden() {
        #expect(visibleTabs(hidden: TabId.allCases, order: [.mixer, .general]) == [.mixer])
    }

    @Test("rótulos das abas")
    func labels() {
        #expect(TabId.claude.label == "IA")
        #expect(TabId.performance.label == "Desempenho")
        #expect(TabId.mixer.label == "Mixer de volume")
    }
}
