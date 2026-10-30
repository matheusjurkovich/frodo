import AppKit
import FrodoCore
import Observation

@MainActor
@Observable
final class IslandModel {
    var isOpen = false
    var tab: TabId = .general
    var slideDirection: CGFloat = 1
    var settingsOpen = false
    var powerMenuOpen = false
    var presence: PillPresence = .pill
    var peek: PeekState?
    var position: IslandPosition = .topCenter
    var settingsSection: SettingsSection = .general
    var pillSize = CGSize(width: 220, height: Theme.Size.pillHeight)
    var islandHeight: CGFloat = 400
    var activity: PillActivity?
    var subjectToken = 0
    var panelHeight: CGFloat = Theme.Size.maxIslandHeight + Theme.Size.panelPadding

    var showsTongue: Bool {
        presence == .tongue && !isOpen
    }

    var isHidden: Bool {
        presence == .hidden && !isOpen
    }

    var pillHasAction: Bool {
        presence == .pill && peek == nil && activity?.hasAction == true
    }

    var targetSize: CGSize {
        if isOpen { return CGSize(width: Theme.Size.islandWidth, height: min(islandHeight, Theme.Size.maxIslandHeight)) }
        if presence != .pill { return position.isSideEdge ? CGSize(width: 8, height: 120) : CGSize(width: 120, height: 8) }
        return pillSize
    }

    func updateActivity(_ next: PillActivity?) {
        if !sameSubject(activity, next) { subjectToken += 1 }
        activity = next
    }

    func updatePeek(_ next: PeekState?) {
        if (peek == nil) != (next == nil) { subjectToken += 1 }
        peek = next
    }

    func select(_ next: TabId, visible: [TabId]) {
        guard next != tab else { return }
        let from = visible.firstIndex(of: tab) ?? 0
        let to = visible.firstIndex(of: next) ?? 0
        slideDirection = to >= from ? 1 : -1
        tab = next
        settingsOpen = false
    }
}
