import CoreGraphics
import Foundation
import Testing

@testable import FrodoCore

@Suite("moveTo")
struct ReorderTests {
    @Test("leva o item para a posição pedida")
    func takesTheItemToTheRequestedPosition() {
        #expect(moveTo(["a", "b", "c", "d"], "a", 2) == ["b", "c", "a", "d"])
        #expect(moveTo(["a", "b", "c", "d"], "d", 0) == ["d", "a", "b", "c"])
    }

    @Test("prende a posição nas pontas")
    func clampsThePositionToTheEnds() {
        #expect(moveTo(["a", "b", "c"], "b", -1) == ["b", "a", "c"])
        #expect(moveTo(["a", "b", "c"], "b", 9) == ["a", "c", "b"])
    }

    @Test("item que não está na lista não muda nada")
    func anUnknownItemChangesNothing() {
        #expect(moveTo(["a", "b"], "z", 0) == ["a", "b"])
    }
}

@Suite("destino ao arrastar")
struct InsertionIndexTests {
    private let column = [CGRect(x: 0, y: 0, width: 100, height: 40), CGRect(x: 0, y: 40, width: 100, height: 40), CGRect(x: 0, y: 80, width: 100, height: 40)]
    private let wrapped = [CGRect(x: 0, y: 0, width: 80, height: 32), CGRect(x: 88, y: 0, width: 80, height: 32), CGRect(x: 0, y: 40, width: 80, height: 32)]

    @Test("na vertical entra depois do item cujo centro o cursor passou")
    func verticalGoesAfterTheItemWhoseCentreWasPassed() {
        #expect(insertionIndex(column, at: CGPoint(x: 50, y: 50), horizontal: false) == 1)
        #expect(insertionIndex(column, at: CGPoint(x: 50, y: 70), horizontal: false) == 2)
        #expect(insertionIndex(column, at: CGPoint(x: 50, y: -30), horizontal: false) == 0)
        #expect(insertionIndex(column, at: CGPoint(x: 50, y: 300), horizontal: false) == 3)
    }

    @Test("na horizontal só conta os itens da linha do cursor")
    func horizontalOnlyCountsTheCursorLine() {
        #expect(insertionIndex(wrapped, at: CGPoint(x: 150, y: 10), horizontal: true) == 2)
        #expect(insertionIndex(wrapped, at: CGPoint(x: 150, y: 50), horizontal: true) == 3)
        #expect(insertionIndex(wrapped, at: CGPoint(x: 10, y: 50), horizontal: true) == 2)
    }

    @Test("fora de qualquer linha não há destino")
    func outsideEveryLineThereIsNoDestination() {
        #expect(insertionIndex(wrapped, at: CGPoint(x: 10, y: 36), horizontal: true) == nil)
        #expect(insertionIndex([], at: .zero, horizontal: false) == nil)
    }
}

@Suite("itens da pílula")
struct PillItemsTests {
    private let everything = RotationState(hasBattery: true, providerEnabled: { _ in true })

    @Test("lista os itens fora da pílula na ordem do catálogo")
    func listsTheMissingItemsInCatalogOrder() {
        #expect(missingItems([.ram, .clock, .date, .notifications, .battery]) == [.claudeSession, .claudeWeekly, .codexSession, .codexWeekly, .geminiDaily])
    }

    @Test("esconde itens de IA desligada")
    func hidesItemsOfDisabledAi() {
        let missing = missingItems([.clock], providerEnabled: { $0 == .codex })
        #expect(!missing.contains(.claudeSession))
        #expect(!missing.contains(.geminiDaily))
        #expect(missing.contains(.codexWeekly))
    }

    @Test("nada falta quando todos estão na pílula")
    func nothingIsMissingWhenAllAreInThePill() {
        #expect(missingItems(ClosedItem.allCases).isEmpty)
    }

    @Test("tirar remove o item e mantém a ordem dos outros")
    func removingDropsTheItemAndKeepsTheOthersInOrder() {
        #expect(removingItem([.clock, .battery, .ram], .battery) == [.clock, .ram])
    }

    @Test("o último item não sai")
    func theLastItemStays() {
        #expect(removingItem([.clock], .clock) == [.clock])
    }

    @Test("adicionar põe no fim")
    func addingAppendsToTheEnd() {
        #expect(addingItem([.clock, .battery], .ram) == [.clock, .battery, .ram])
    }

    @Test("adicionar um item que já está não duplica")
    func addingAnExistingItemDoesNotDuplicate() {
        #expect(addingItem([.clock, .battery], .clock) == [.clock, .battery])
    }

    @Test("mover para a esquerda e para a direita troca com o vizinho")
    func movingLeftAndRightSwapsWithTheNeighbour() {
        let items: [ClosedItem] = [.clock, .date, .battery]
        #expect(movingItem(items, .date, by: -1) == [.date, .clock, .battery])
        #expect(movingItem(items, .date, by: 1) == [.clock, .battery, .date])
    }

    @Test("mover além das pontas não muda a lista")
    func movingPastTheEndsDoesNotChangeTheList() {
        let items: [ClosedItem] = [.clock, .date, .battery]
        #expect(movingItem(items, .clock, by: -1) == items)
        #expect(movingItem(items, .battery, by: 1) == items)
    }

    @Test("modo mínimo mostra só o relógio")
    func minimalModeShowsOnlyTheClock() {
        #expect(visibleItems(mode: .minimal, items: [.date, .battery, .ram]) == [.clock])
    }

    @Test("modo compacto mostra todos na ordem")
    func compactModeShowsAllInOrder() {
        #expect(visibleItems(mode: .compact, items: [.battery, .clock, .ram]) == [.battery, .clock, .ram])
    }

    @Test("modo rotativo guarda um lugar só para os itens de texto, no primeiro deles")
    func rotatingModeKeepsOneSlotForTextItems() {
        #expect(visibleItems(mode: .rotating, items: [.clock, .battery, .date, .ram, .claudeSession]) == [.clock, .battery, .date])
        #expect(visibleItems(mode: .rotating, items: [.clock, .date]) == [.clock, .date])
    }

    @Test("modo compacto esconde o item de IA desligada, menos o Claude")
    func compactModeHidesDisabledProviderItemsExceptClaude() {
        let items: [ClosedItem] = [.clock, .codexSession, .geminiDaily, .claudeSession]
        #expect(visibleItems(mode: .compact, items: items, providerEnabled: { $0 == .gemini }) == [.clock, .geminiDaily, .claudeSession])
    }

    @Test("ignora o que não é texto")
    func rotatingItemsIgnoreNonText() {
        #expect(rotatingItems([.clock, .ram], RotationState(hasBattery: true, providerEnabled: { _ in true })) == [.ram])
    }

    @Test("tira a bateria quando não há bateria")
    func rotatingItemsDropBatteryWithoutBattery() {
        let items: [ClosedItem] = [.clock, .battery, .ram, .codexSession, .geminiDaily, .claudeWeekly]
        #expect(!rotatingItems(items, RotationState(hasBattery: false, providerEnabled: { _ in true })).contains(.battery))
    }

    @Test("tira provedor desativado, menos o Claude")
    func rotatingItemsDropDisabledProviderExceptClaude() {
        let items: [ClosedItem] = [.clock, .battery, .ram, .codexSession, .geminiDaily, .claudeWeekly]
        let state = RotationState(hasBattery: true, providerEnabled: { $0 == .gemini })
        #expect(rotatingItems(items, state) == [.battery, .ram, .geminiDaily, .claudeWeekly])
    }

    @Test("o item rotativo troca a cada intervalo, só entre os de texto")
    func rotatingItemChangesEveryInterval() {
        let items: [ClosedItem] = [.clock, .battery, .ram, .claudeSession]
        #expect(rotatingItem(items, now: Date(timeIntervalSince1970: 0), everySeconds: 5, state: everything) == .battery)
        #expect(rotatingItem(items, now: Date(timeIntervalSince1970: 4), everySeconds: 5, state: everything) == .battery)
        #expect(rotatingItem(items, now: Date(timeIntervalSince1970: 5), everySeconds: 5, state: everything) == .ram)
        #expect(rotatingItem(items, now: Date(timeIntervalSince1970: 15), everySeconds: 5, state: everything) == .battery)
    }

    @Test("sem item de texto não há item rotativo")
    func noTextItemMeansNoRotatingItem() {
        #expect(rotatingItem([.clock, .date], now: Date(), everySeconds: 5, state: everything) == nil)
        #expect(rotatingItem([], now: Date(), everySeconds: 5, state: everything) == nil)
    }

    @Test("intervalo zero vale como um segundo")
    func zeroIntervalCountsAsOneSecond() {
        let items: [ClosedItem] = [.battery, .ram]
        #expect(rotatingItem(items, now: Date(timeIntervalSince1970: 1), everySeconds: 0, state: everything) == .ram)
        #expect(rotatingItem(items, now: Date(timeIntervalSince1970: -1), everySeconds: 1, state: everything) == .ram)
    }

    @Test("rótulos iguais aos do Linux")
    func labelsMatchLinux() {
        #expect(ClosedItem.clock.label == "Relógio")
        #expect(ClosedItem.ram.label == "RAM")
        #expect(ClosedItem.claudeSession.label == "Claude · sessão")
        #expect(ClosedItem.claudeWeekly.label == "Claude · semana")
        #expect(ClosedItem.codexSession.label == "Codex · 5 h")
        #expect(ClosedItem.codexWeekly.label == "Codex · semana")
        #expect(ClosedItem.geminiDaily.label == "Gemini · hoje")
        #expect(ClosedMode.minimal.label == "Mínimo")
        #expect(ClosedMode.compact.label == "Compacto")
        #expect(ClosedMode.rotating.label == "Rotativo")
    }
}

@Suite("memória")
struct MemoryFormatTests {
    private let memory = MemoryInfo(totalBytes: 16 * 1_073_741_824, usedBytes: 10 * 1_073_741_824)

    @Test("porcentagem usada arredonda")
    func usedPercentRounds() {
        #expect(usedPercent(memory) == 63)
        #expect(usedPercent(MemoryInfo(totalBytes: 3, usedBytes: 1)) == 33)
    }

    @Test("total zero dá zero")
    func zeroTotalGivesZero() {
        #expect(usedPercent(MemoryInfo(totalBytes: 0, usedBytes: 0)) == 0)
    }

    @Test("RAM em GB por padrão")
    func ramInGigabytesByDefault() {
        #expect(formatRam(memory, percent: false) == "RAM 10.0G")
    }

    @Test("RAM em porcentagem quando pedido")
    func ramAsPercentWhenAsked() {
        #expect(formatRam(memory, percent: true) == "RAM 63%")
    }

    @Test("sem leitura mostra traço")
    func noReadingShowsADash() {
        #expect(formatRam(nil, percent: false) == "RAM —")
        #expect(formatRam(nil, percent: true) == "RAM —")
    }
}
