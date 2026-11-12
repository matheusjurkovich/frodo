import FrodoCore
import SwiftUI

private struct PillVerticalKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var pillVertical: Bool {
        get { self[PillVerticalKey.self] }
        set { self[PillVerticalKey.self] = newValue }
    }
}

struct PillStack<Content: View>: View {
    @Environment(\.pillVertical) private var vertical
    let spacing: CGFloat
    let content: Content

    init(spacing: CGFloat = 10, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    var body: some View {
        let layout = vertical ? AnyLayout(VStackLayout(alignment: .center, spacing: 10)) : AnyLayout(HStackLayout(spacing: spacing))
        layout { content }
    }
}

struct PillContent: View {
    let services: FrodoServices
    let activity: PillActivity?
    var peek: PeekState?
    var vertical = false
    var openTab: (TabId) -> Void = { _ in }

    var body: some View {
        Group {
            if let peek {
                PeekContent(peek: peek)
            } else {
                activityContent
            }
        }
        .fixedSize()
        .padding(.horizontal, vertical ? 12 : 16)
        .padding(.vertical, vertical ? 16 : 0)
        .frame(minHeight: vertical ? nil : Theme.Size.pillHeight)
        .environment(\.pillVertical, vertical)
    }

    @ViewBuilder
    private var activityContent: some View {
        switch activity {
        case .none:
            IdleContent(services: services)
        case let .notification(item)?:
            NotificationContent(item: item)
        case let .claudePermission(session, request)?:
            PermissionContent(services: services, session: session, request: request)
        case let .claudeWaiting(session)?:
            WaitingContent(services: services, session: session, openTab: openTab)
        case let .meeting(title, startsAt)?:
            MeetingContent(services: services, title: title, startsAt: startsAt)
        case let .volume(percent)?:
            VolumeContent(percent: percent)
        case let .claudeWorking(session)?:
            WorkingContent(session: session)
        case let .media(track)?:
            MediaContent(services: services, track: track)
        case .recording?:
            EmptyView()
        }
    }
}

struct PeekContent: View {
    let peek: PeekState
    @State private var remaining = 1.0

    var body: some View {
        VStack(spacing: 4) {
            Text(peek.startedAt.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)))
                .font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).monospacedDigit()
            Capsule().fill(Theme.accent).frame(height: 2).scaleEffect(x: remaining, anchor: .leading)
        }
        .onAppear { withAnimation(Motion.peekCountdown(seconds: peek.seconds)) { remaining = 0 } }
    }
}
