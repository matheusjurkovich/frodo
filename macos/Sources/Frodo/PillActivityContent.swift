import FrodoCore
import FrodoPlatform
import SwiftUI

struct NotificationContent: View {
    @Environment(\.pillVertical) private var vertical
    let item: InterceptedNotification

    var body: some View {
        PillStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.claude.opacity(0.2)).frame(width: 30, height: 30)
                FrodoIcon(name: "claude", size: 16, color: Theme.claude)
            }
            VStack(alignment: vertical ? .center : .leading, spacing: 1) {
                Text("\(item.app) · \(item.title)").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                Text(item.body).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).lineLimit(1)
            }
            .frame(maxWidth: 320, alignment: vertical ? .center : .leading)
        }
    }
}

struct PermissionContent: View {
    @Environment(\.pillVertical) private var vertical
    let services: FrodoServices
    let session: SessionState
    let request: PendingRequest

    var body: some View {
        PillStack(spacing: 10) {
            FrodoIcon(name: session.provider.rawValue, size: 18, color: Theme.warn)
            VStack(alignment: vertical ? .center : .leading, spacing: 1) {
                Text("\(ellipsize(session.repo, max: 24)) precisa de permissão").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                Text(session.step.isEmpty ? request.tool : session.step).font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary).lineLimit(1)
            }
            .frame(maxWidth: 280, alignment: vertical ? .center : .leading)
            TextButton(title: "Negar", kind: .secondary, compact: true) { services.sessions.decide(request, .deny) }
            TextButton(title: "Aprovar", kind: .primary, compact: true) { services.sessions.decide(request, .allow) }
        }
        .frame(minHeight: Theme.Size.pillActionHeight - 8)
    }
}

struct WaitingContent: View {
    let services: FrodoServices
    let session: SessionState
    let openTab: (TabId) -> Void

    var body: some View {
        PillStack(spacing: 10) {
            FrodoIcon(name: session.provider.rawValue, size: 18, color: Theme.warn)
            Text("\(ellipsize(session.repo, max: 24)) precisa de permissão").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
            if !session.step.isEmpty {
                Text(ellipsize(session.step, max: 40)).font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary).lineLimit(1)
            }
            TextButton(title: "Abrir", kind: .primary, compact: true) {
                if !services.sessions.focus(session.sessionId) { openTab(.claude) }
            }
        }
    }
}

struct MeetingContent: View {
    @Environment(\.pillVertical) private var vertical
    let services: FrodoServices
    let title: String
    let startsAt: Date
    let openTab: (TabId) -> Void

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { context in
            PillStack(spacing: 10) {
                FrodoIcon(name: "calendar", size: 18, color: Theme.accentText)
                VStack(alignment: vertical ? .center : .leading, spacing: 1) {
                    Text(title).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                    Text(formatUntil(startsAt, now: context.date)).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                }
                .frame(maxWidth: 240, alignment: vertical ? .center : .leading)
                TextButton(title: services.calendar.nextMeetingURL == nil ? "Abrir" : "Entrar", kind: .primary, compact: true) {
                    if let url = services.calendar.nextMeetingURL { SystemActions.open(url) } else { openTab(.calendar) }
                }
            }
        }
    }
}

struct VolumeContent: View {
    let percent: Int

    var body: some View {
        PillStack(spacing: 10) {
            FrodoIcon(name: "wave", size: 16, color: Theme.text)
            ProgressBar(fraction: Double(percent) / 100, tint: Theme.accent, height: 6).frame(width: 120)
            Text("\(percent)%").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).monospacedDigit().frame(width: 40, alignment: .trailing)
        }
    }
}

struct WorkingContent: View {
    let session: SessionState

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            PillStack(spacing: 10) {
                ProviderIcon(provider: session.provider, size: 16)
                Text(session.repo).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text)
                Text(ellipsize(session.step, max: 36)).font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary).lineLimit(1)
                Text(formatTimer(secondsSince(session.since, now: context.date))).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).monospacedDigit()
            }
        }
    }
}

struct MediaContent: View {
    @Environment(\.pillVertical) private var vertical
    let services: FrodoServices
    let track: MediaTrack

    var body: some View {
        PillStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.control).frame(width: 28, height: 28)
                FrodoIcon(name: "music", size: 14, color: Theme.accentText)
            }
            VStack(alignment: vertical ? .center : .leading, spacing: 0) {
                Text(track.title).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                Text(track.artist).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).lineLimit(1)
            }
            .frame(maxWidth: 200, alignment: vertical ? .center : .leading)
            IconButton(icon: "pause", size: 28, iconSize: 12) { services.media.playPause() }
        }
    }
}
