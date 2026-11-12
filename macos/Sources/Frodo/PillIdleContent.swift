import FrodoCore
import FrodoPlatform
import SwiftUI

struct IdleContent: View {
    let services: FrodoServices

    private var items: [ClosedItem] {
        let settings = services.settings
        return visibleItems(mode: settings.closedMode, items: settings.closedItems, providerEnabled: { settings.providerEnabled($0) })
    }

    var body: some View {
        let revisions = services.revisions
        let _ = revisions.settings + revisions.system + revisions.claude + revisions.codex + revisions.gemini + revisions.notifications
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
            Text(formatClock(now, seconds: services.settings.showSeconds)).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).monospacedDigit()
        case .date:
            Text(formatDate(now)).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
        case .notifications:
            NotificationCount(count: services.notifications.count)
        case .battery, .ram, .claudeSession, .claudeWeekly, .codexSession, .codexWeekly, .geminiDaily:
            if services.settings.closedMode == .rotating {
                rotatingSlot(now: now)
            } else {
                textSegment(item, now: now)
            }
        }
    }

    private func rotatingSlot(now: Date) -> some View {
        let settings = services.settings
        let state = RotationState(hasBattery: services.system.batteryInfo != nil, providerEnabled: { settings.providerEnabled($0) })
        let rotating = rotatingItem(settings.closedItems, now: now, everySeconds: settings.rotateSeconds, state: state)
        return ZStack {
            if let rotating {
                textSegment(rotating, now: now).id(rotating).transition(.opacity)
            }
        }
        .animation(Motion.swapFade, value: rotating)
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
        case .codexSession:
            ProviderUsageSegment(services: services, provider: .codex, key: "session", suffix: "", now: now)
        case .codexWeekly:
            ProviderUsageSegment(services: services, provider: .codex, key: "weekly", suffix: " · 7d", now: now)
        case .geminiDaily:
            ProviderUsageSegment(services: services, provider: .gemini, key: "daily", suffix: " hoje", now: now)
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

struct NotificationCount: View {
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

struct ProviderUsageSegment: View {
    let services: FrodoServices
    let provider: AiProvider
    let key: String
    let suffix: String
    let now: Date

    var body: some View {
        HStack(spacing: 4) {
            ProviderIcon(provider: provider, size: 13)
            if let meter = services.meters(provider, now: now).first(where: { $0.key == key }) {
                let remaining = services.settings.claudeShowRemaining
                let level = meterLevel(meter.percent)
                ProviderRing(provider: provider, used: meter.percent, remaining: remaining, size: 12)
                Text("\(Int(shownMeterPercent(meter.percent, remaining: remaining).rounded()))%\(suffix)")
                    .font(Theme.Font.secondary(.medium)).foregroundStyle(level == .ok ? Theme.text : Theme.color(for: level)).monospacedDigit()
            } else {
                Text("—").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.textSecondary)
            }
        }
    }
}
