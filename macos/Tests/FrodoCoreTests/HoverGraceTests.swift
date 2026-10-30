import CoreGraphics
import Foundation
import Testing

@testable import FrodoCore

private let tall = CGRect(x: 100, y: 100, width: 900, height: 700)
private let short = CGRect(x: 100, y: 100, width: 900, height: 300)
private let onTheOldHeader = CGPoint(x: 500, y: 760)

@Suite("tolerância do cursor ao redimensionar a ilha")
struct HoverGraceTests {
    @Test("cursor dentro da forma conta como sobre a ilha")
    func pointerInsideCountsAsOver() {
        var grace = HoverGrace()
        let isOver = grace.isOverIsland(pointer: CGPoint(x: 500, y: 300), shape: tall)
        #expect(isOver)
    }

    @Test("cursor fora da forma desde o início não conta")
    func pointerOutsideFromTheStartDoesNotCount() {
        var grace = HoverGrace()
        let isOver = grace.isOverIsland(pointer: CGPoint(x: 5, y: 5), shape: tall)
        #expect(!isOver)
    }

    @Test("forma encolhe e deixa o cursor parado fora: continua sobre a ilha")
    func shrinkingShapeLeavingTheStillPointerOutsideKeepsIt() {
        var grace = HoverGrace()
        let beforeShrink = grace.isOverIsland(pointer: onTheOldHeader, shape: tall)
        #expect(beforeShrink)
        let rightAfterShrink = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        #expect(rightAfterShrink)
        let stillWaiting = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        #expect(stillWaiting)
    }

    @Test("pequena trepidação do cursor não encerra a tolerância")
    func smallJitterKeepsTheGrace() {
        var grace = HoverGrace()
        _ = grace.isOverIsland(pointer: onTheOldHeader, shape: tall)
        _ = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        let afterJitter = grace.isOverIsland(pointer: CGPoint(x: onTheOldHeader.x + 2, y: onTheOldHeader.y - 1), shape: short)
        #expect(afterJitter)
    }

    @Test("cursor que se afasta de verdade encerra a tolerância")
    func pointerMovingAwayEndsTheGrace() {
        var grace = HoverGrace()
        _ = grace.isOverIsland(pointer: onTheOldHeader, shape: tall)
        _ = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        let afterMovingAway = grace.isOverIsland(pointer: CGPoint(x: onTheOldHeader.x + 30, y: onTheOldHeader.y), shape: short)
        #expect(!afterMovingAway)
        let afterComingBack = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        #expect(!afterComingBack)
    }

    @Test("cursor que volta para dentro e sai de novo sem redimensionar não ganha tolerância")
    func reenteringAndLeavingWithoutResizeGetsNoGrace() {
        var grace = HoverGrace()
        _ = grace.isOverIsland(pointer: onTheOldHeader, shape: tall)
        _ = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        let afterReentering = grace.isOverIsland(pointer: CGPoint(x: 500, y: 200), shape: short)
        #expect(afterReentering)
        let afterLeavingAgain = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        #expect(!afterLeavingAgain)
    }

    @Test("forma que muda sem o cursor ter estado dentro antes não dá tolerância")
    func shapeChangeWithoutThePointerInsideGivesNoGrace() {
        var grace = HoverGrace()
        let outside = CGPoint(x: 5, y: 5)
        let beforeChange = grace.isOverIsland(pointer: outside, shape: tall)
        #expect(!beforeChange)
        let afterChange = grace.isOverIsland(pointer: outside, shape: short)
        #expect(!afterChange)
    }

    @Test("forma que muda e ainda contém o cursor não cria tolerância")
    func shapeChangeKeepingThePointerInsideCreatesNoGrace() {
        var grace = HoverGrace()
        let atTheTop = CGPoint(x: 500, y: 350)
        let beforeChange = grace.isOverIsland(pointer: atTheTop, shape: tall)
        #expect(beforeChange)
        let afterChange = grace.isOverIsland(pointer: atTheTop, shape: short)
        #expect(afterChange)
        let afterLeaving = grace.isOverIsland(pointer: CGPoint(x: 5, y: 5), shape: short)
        #expect(!afterLeaving)
    }

    @Test("reset descarta a tolerância")
    func resetDropsTheGrace() {
        var grace = HoverGrace()
        _ = grace.isOverIsland(pointer: onTheOldHeader, shape: tall)
        _ = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        grace.reset()
        let afterReset = grace.isOverIsland(pointer: onTheOldHeader, shape: short)
        #expect(!afterReset)
    }
}
