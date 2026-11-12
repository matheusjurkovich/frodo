import FrodoCore
import FrodoPlatform
import SwiftUI

struct IdleContent: View {
    let services: FrodoServices

    private var items: [ClosedItem] {
        visibleItems(mode: services.settings.closedMode, items: services.settings.closedItems)
    }

    var body: some View {
        let _ = services.revisions.settings + services.revisions.system + services.revisions.claude + services.revisions.notifications
        TimelineView(.periodic(from: .now, by: 1)) { context in
            PillStack(spacing: 12) {
                ForEach(items, id: \.self) { item in
                    segment(item, now: context.date)
                }
            }
        }
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
            if services.settings.closedMode == .rotating,
                let rotating = rotatingItem(services.settings.closedItems, now: now, everySeconds: services.settings.rotateSeconds)
            {
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
                    if services.settings.showBatteryPercentage {
                        Text("\(battery.percent)%").font(Theme.Font.secondary()).foregroundStyle(Theme.text).monospacedDigit()
                    }
                }
            }
        case .ram:
            Text(formatRam(services.system.memoryInfo, percent: services.settings.ramPercent))
                .font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).monospacedDigit()
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
