import Testing

@testable import FrodoCore

@Suite("reordered")
struct ReorderTests {
    @Test("move um item para a frente")
    func movesAnItemForward() {
        #expect(reordered([1, 2, 3, 4], moving: 2, to: 2) == ints(1, 3, 2, 4))
    }

    @Test("move um item para trás")
    func movesAnItemBackward() {
        #expect(reordered([1, 2, 3, 4], moving: 4, to: 0) == ints(4, 1, 2, 3))
    }

    @Test("limita o destino ao começo e ao fim")
    func clampsTheDestinationToTheEnds() {
        #expect(reordered([1, 2, 3], moving: 2, to: -5) == ints(2, 1, 3))
        #expect(reordered([1, 2, 3], moving: 2, to: 99) == ints(1, 3, 2))
    }

    @Test("item que não está na lista deixa a lista como está")
    func anUnknownItemLeavesTheListUntouched() {
        #expect(reordered([1, 2, 3], moving: 9, to: 0) == ints(1, 2, 3))
    }

    private func ints(_ values: Int...) -> [Int] { values }
}

@Suite("itens da pílula")
struct PillItemsTests {
    @Test("lista os itens fora da pílula na ordem do catálogo")
    func listsTheMissingItemsInCatalogOrder() {
        #expect(missingItems([.ram, .clock, .date, .notifications, .battery]) == [.claudeSession, .claudeWeekly])
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

    @Test("rótulos iguais aos do Linux")
    func labelsMatchLinux() {
        #expect(ClosedItem.clock.label == "Relógio")
        #expect(ClosedItem.ram.label == "RAM")
        #expect(ClosedItem.claudeSession.label == "Claude · sessão")
        #expect(ClosedItem.claudeWeekly.label == "Claude · semana")
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
