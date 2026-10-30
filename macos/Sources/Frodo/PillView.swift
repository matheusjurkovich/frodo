import FrodoCore
import FrodoPlatform
import SwiftUI

struct PillContent: View {
    let services: FrodoServices
    let activity: PillActivity?

    var body: some View {
        Group {
            switch activity {
            case .none:
                IdleContent(services: services)
            case let .notification(item)?:
                NotificationContent(item: item)
            case let .claudePermission(session, request)?:
                PermissionContent(services: services, session: session, request: request)
            case let .claudeWaiting(session)?:
                WaitingContent(services: services, session: session)
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
        .fixedSize()
        .padding(.horizontal, 16)
        .frame(minHeight: Theme.Size.pillHeight)
    }
}

struct IdleContent: View {
    let services: FrodoServices

    private var items: [ClosedItem] {
        let settings = services.settings
        switch settings.closedMode {
        case .minimal:
            return [.clock]
        case .compact:
            return settings.closedItems
        case .rotating:
            let all = settings.closedItems
            let firstText = all.firstIndex(where: \.isText)
            return all.enumerated().filter { !$0.element.isText || $0.offset == firstText }.map(\.element)
        }
    }

    var body: some View {
        let _ = services.revisions.settings + services.revisions.system + services.revisions.claude + services.revisions.notifications
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack(spacing: 12) {
                ForEach(items, id: \.self) { item in
                    segment(item, now: context.date)
                }
            }
        }
    }

    private var textItems: [ClosedItem] {
        services.settings.closedItems.filter(\.isText)
    }

    @ViewBuilder
    private func segment(_ item: ClosedItem, now: Date) -> some View {
        switch item {
        case .clock:
            Text(now.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).monospacedDigit()
        case .date:
            Text(formatDate(now)).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
        case .notifications:
            NotificationBadge(count: services.notifications.count)
        case .battery, .ram, .claudeSession, .claudeWeekly:
            if services.settings.closedMode == .rotating, !textItems.isEmpty {
                let step = max(1, services.settings.rotateSeconds)
                let rotating = textItems[Int(now.timeIntervalSince1970) / step % textItems.count]
                textSegment(rotating, now: now).id(rotating)
            } else {
                textSegment(item, now: now)
            }
        }
    }

    @ViewBuilder
    private func textSegment(_ item: ClosedItem, now: Date) -> some View {
        switch item {
        case .battery:
            if let battery = services.system.batteryInfo {
                HStack(spacing: 4) {
                    FrodoIcon(name: batteryIcon(battery), size: 14, color: battery.percent < 15 && !battery.charging ? Theme.danger : Theme.text)
                    Text("\(battery.percent)%").font(Theme.Font.secondary()).foregroundStyle(Theme.text).monospacedDigit()
                }
            }
        case .ram:
            if let memory = services.system.memoryInfo {
                Text("RAM \(formatGb(memory.usedBytes))").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).monospacedDigit()
            }
        case .claudeSession, .claudeWeekly:
            ClaudeUsageSegment(services: services, role: item == .claudeSession ? .session : .weekly, now: now)
        default:
            EmptyView()
        }
    }

    private func batteryIcon(_ battery: BatteryInfo) -> String {
        switch batteryLevel(battery) {
        case .charging: "battery-charging"
        case .full: "battery-full"
        case .high: "battery-high"
        case .medium: "battery-medium"
        case .low: "battery-low"
        case .empty: "battery-empty"
        }
    }
}

struct NotificationBadge: View {
    let count: Int

    var body: some View {
        HStack(spacing: 4) {
            FrodoIcon(name: "bell", size: 14, color: count > 0 ? Theme.accentText : Theme.textSecondary)
            if count > 0 { Text("\(count)").font(Theme.Font.label(.semibold)).foregroundStyle(Theme.accentText).monospacedDigit() }
        }
    }
}

struct ClaudeUsageSegment: View {
    let services: FrodoServices
    let role: WindowRole
    let now: Date

    var body: some View {
        if let window = services.claude.active?.windows.first(where: { $0.role == role }) {
            let input = LevelInput(utilization: window.utilization, resetsAt: window.resetsAt, totalSeconds: window.totalSeconds, apiLevel: window.apiLevel)
            let level = displayLevel(input, now: now)
            let shown = shownPercent(window.utilization, remaining: services.settings.claudeShowRemaining)
            HStack(spacing: 4) {
                FrodoIcon(name: "claude", size: 13, color: Theme.claude)
                Text("\(Int(shown.rounded()))%").font(Theme.Font.secondary(.medium)).foregroundStyle(level == .ok ? Theme.text : Theme.color(for: level)).monospacedDigit()
            }
        }
    }
}

struct NotificationContent: View {
    let item: InterceptedNotification

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.claude.opacity(0.2)).frame(width: 30, height: 30)
                FrodoIcon(name: "claude", size: 16, color: Theme.claude)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("\(item.app) · \(item.title)").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                Text(item.body).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).lineLimit(1)
            }
            .frame(maxWidth: 320, alignment: .leading)
        }
    }
}

struct PermissionContent: View {
    let services: FrodoServices
    let session: SessionState
    let request: PendingRequest

    var body: some View {
        HStack(spacing: 10) {
            FrodoIcon(name: "claude", size: 18, color: Theme.warn)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(session.repo) precisa de permissão").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                Text(session.step.isEmpty ? request.tool : session.step).font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary).lineLimit(1)
            }
            .frame(maxWidth: 280, alignment: .leading)
            TextButton(title: "Negar", kind: .secondary, compact: true) { services.sessions.decide(request, .deny) }
            TextButton(title: "Aprovar", kind: .primary, compact: true) { services.sessions.decide(request, .allow) }
        }
        .frame(minHeight: Theme.Size.pillActionHeight - 8)
    }
}

struct WaitingContent: View {
    let services: FrodoServices
    let session: SessionState

    var body: some View {
        HStack(spacing: 10) {
            FrodoIcon(name: "claude", size: 18, color: Theme.warn)
            Text("\(session.repo) aguardando você").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
            TextButton(title: "Abrir", compact: true) { _ = services.sessions.focus(session.sessionId) }
        }
    }
}

struct MeetingContent: View {
    let services: FrodoServices
    let title: String
    let startsAt: Date

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { context in
            HStack(spacing: 10) {
                FrodoIcon(name: "calendar", size: 18, color: Theme.accentText)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                    Text(formatUntil(startsAt, now: context.date)).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                }
                .frame(maxWidth: 240, alignment: .leading)
                TextButton(title: services.calendar.nextMeetingURL == nil ? "Abrir" : "Entrar", kind: .primary, compact: true) {
                    if let url = services.calendar.nextMeetingURL { SystemActions.open(url) } else { SystemActions.open(URL(fileURLWithPath: "/System/Applications/Calendar.app")) }
                }
            }
        }
    }
}

struct VolumeContent: View {
    let percent: Int

    var body: some View {
        HStack(spacing: 10) {
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
            HStack(spacing: 10) {
                FrodoIcon(name: "claude", size: 16, color: Theme.claude)
                Text(session.repo).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text)
                Text(ellipsize(session.step, max: 36)).font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary).lineLimit(1)
                Text(formatTimer(secondsSince(session.since, now: context.date))).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).monospacedDigit()
            }
        }
    }
}

struct MediaContent: View {
    let services: FrodoServices
    let track: MediaTrack

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(Theme.control).frame(width: 28, height: 28)
                FrodoIcon(name: "music", size: 14, color: Theme.accentText)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(track.title).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                Text(track.artist).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).lineLimit(1)
            }
            .frame(maxWidth: 200, alignment: .leading)
            IconButton(icon: "pause", size: 28, iconSize: 12) { services.media.playPause() }
        }
    }
}
