import CoreGraphics
import Foundation
import Testing

@testable import FrodoCore

private let visible = CGRect(x: 0, y: 0, width: 1710, height: 1074)
private let island = CGSize(width: 900, height: 760)

@Suite("posição da ilha")
struct IslandPositionTests {
    @Test("as oito posições cobrem a grade 3 por 3 sem o centro")
    func eightPositionsCoverTheGridWithoutTheCenter() {
        let cells = IslandPosition.allCases.map { "\($0.vertical)-\($0.horizontal)" }
        #expect(Set(cells).count == 8)
        #expect(!cells.contains("middle-center"))
    }

    @Test("em cima no meio fica centrada logo abaixo da barra de menus")
    func topCenterIsCenteredBelowTheMenuBar() {
        let frame = islandPanelFrame(position: .topCenter, visible: visible, islandSize: island, padding: 50, margin: 6)
        #expect(frame.width == 1000)
        #expect(frame.midX == 855)
        #expect(frame.maxY == 1068)
    }

    @Test("cantos e bordas respeitam a margem e a área visível")
    func cornersAndEdgesRespectMarginAndVisibleArea() {
        let bottomLeft = islandPanelFrame(position: .bottomLeft, visible: visible, islandSize: island, padding: 50, margin: 6)
        #expect(bottomLeft.minX == 6)
        #expect(bottomLeft.minY == 6)
        let bottomRight = islandPanelFrame(position: .bottomRight, visible: visible, islandSize: island, padding: 50, margin: 6)
        #expect(bottomRight.maxX == 1704)
        #expect(bottomRight.minY == 6)
        let middleLeft = islandPanelFrame(position: .middleLeft, visible: visible, islandSize: island, padding: 50, margin: 6)
        #expect(middleLeft.midY == visible.midY)
        #expect(middleLeft.height == 860)
        let dockOnTheLeft = CGRect(x: 80, y: 0, width: 1630, height: 1074)
        #expect(islandPanelFrame(position: .middleLeft, visible: dockOnTheLeft, islandSize: island, padding: 50, margin: 6).minX == 86)
    }

    @Test("a forma encosta no canto do painel onde cresce")
    func shapeTouchesTheCornerOfThePanelWhereItGrows() {
        let panel = islandPanelFrame(position: .bottomRight, visible: visible, islandSize: island, padding: 50, margin: 6)
        let pill = islandShapeRect(position: .bottomRight, panel: panel, size: CGSize(width: 220, height: 40))
        #expect(pill.maxX == panel.maxX)
        #expect(pill.minY == panel.minY)
        let top = islandPanelFrame(position: .topCenter, visible: visible, islandSize: island, padding: 50, margin: 6)
        let topPill = islandShapeRect(position: .topCenter, panel: top, size: CGSize(width: 220, height: 40))
        #expect(topPill.maxY == top.maxY)
        #expect(topPill.midX == top.midX)
        let side = islandPanelFrame(position: .middleRight, visible: visible, islandSize: island, padding: 50, margin: 6)
        let sidePill = islandShapeRect(position: .middleRight, panel: side, size: CGSize(width: 220, height: 40))
        #expect(sidePill.midY == side.midY)
        #expect(sidePill.maxX == side.maxX)
    }

    @Test("a ilha aberta cabe dentro do painel em qualquer posição")
    func openIslandFitsInsideThePanelInAnyPosition() {
        for position in IslandPosition.allCases {
            let panel = islandPanelFrame(position: position, visible: visible, islandSize: island, padding: 50, margin: 6)
            let shape = islandShapeRect(position: position, panel: panel, size: island)
            #expect(panel.contains(shape), "\(position)")
            #expect(visible.contains(shape), "\(position)")
        }
    }
}

@MainActor
@Suite("posição nas configurações")
struct PositionSettingsTests {
    @Test("padrão em cima no meio, grava e ignora valor inválido")
    func defaultsToTopCenterStoresAndIgnoresInvalidValue() {
        let suite = "frodo-position-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        let settings = FrodoSettings(defaults: defaults)
        #expect(settings.position == .topCenter)
        settings.position = .bottomRight
        #expect(settings.position == .bottomRight)
        defaults.set("diagonal", forKey: "position")
        #expect(settings.position == .topCenter)
    }
}
