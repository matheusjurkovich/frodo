import FrodoCore
import FrodoPlatform
import SwiftUI

struct LimitsCard: View {
    let services: FrodoServices
    @State private var selectedProfileId: String?

    var body: some View {
        let _ = services.revisions.claude + services.revisions.settings
        let profiles = services.claude.profiles
        let usage = profiles.first { $0.profile.id == selectedProfileId } ?? services.claude.active
        CardView(title: "Limites de uso") {
            if profiles.count > 1 {
                HStack(spacing: 6) {
                    ForEach(profiles, id: \.profile.id) { item in
                        FilterChip(title: item.profile.label, selected: item.profile.id == usage?.profile.id) {
                            withAnimation(Motion.standard) { selectedProfileId = item.profile.id }
                        }
                    }
                }
            }
            if let usage {
                if let subtitle = usage.subtitle { Text(subtitle).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary) }
                switch usage.status {
                case .loading:
                    Text("Carregando…").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
                case .signedOut, .error:
                    Text(usage.error ?? "Erro desconhecido").font(Theme.Font.secondary()).foregroundStyle(Theme.warn)
                    if usage.windows.isEmpty == false { windows(usage) }
                case .ok:
                    windows(usage)
                }
            } else {
                Text("Nenhum perfil do Claude Code encontrado.").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
            }
        } trailing: {
            HStack(spacing: 6) {
                if let tier = usage?.tier { Chip(text: tier, tint: Theme.claude) }
                IconButton(icon: "refresh", size: 28, iconSize: 12, help: "Atualizar") { Task { await services.claude.refresh(force: true) } }
            }
        }
    }

    @ViewBuilder
    private func windows(_ usage: ProfileUsage) -> some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            VStack(spacing: 12) {
                ForEach(usage.windows, id: \.key) { window in
                    WindowRow(window: window, remaining: services.settings.claudeShowRemaining, now: context.date)
                }
                if let spend = usage.spend { SpendRow(spend: spend) }
            }
        }
    }
}

private struct WindowRow: View {
    let window: UsageWindow
    let remaining: Bool
    let now: Date

    var body: some View {
        let input = LevelInput(utilization: window.utilization, resetsAt: window.resetsAt, totalSeconds: window.totalSeconds, apiLevel: window.apiLevel)
        let level = displayLevel(input, now: now)
        let pace = pacePercent(resetsAt: window.resetsAt, totalSeconds: window.totalSeconds, now: now)
        let note = projectionNote(input, remaining: remaining, now: now)
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(window.label).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text)
                Spacer()
                Text(relativeReset(window.resetsAt, now: now)).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                Text("\(Int(shownPercent(window.utilization, remaining: remaining).rounded()))%").font(Theme.Font.secondary(.semibold))
                    .foregroundStyle(level == .ok ? Theme.text : Theme.color(for: level)).monospacedDigit().frame(width: 44, alignment: .trailing)
            }
            ProgressBar(
                fraction: remaining ? (100 - window.utilization) / 100 : window.utilization / 100, tint: Theme.color(for: level),
                marker: shownPace(pace, remaining: remaining).map { $0 / 100 }
            )
            if !note.isEmpty { Text(note).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary) }
        }
    }
}

private struct SpendRow: View {
    let spend: Spend

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("Uso extra").font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text)
                Spacer()
                Text([spend.used, spend.limit.map { "de \($0)" }].compactMap { $0 }.joined(separator: " ")).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            }
            if let percent = spend.percent { ProgressBar(fraction: percent / 100, tint: Theme.color(for: spend.level)) }
        }
    }
}
