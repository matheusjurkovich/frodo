import FrodoCore
import FrodoPlatform
import SwiftUI

private let quotaMaxAge: TimeInterval = 60
private let overviewMeters = 2

extension FrodoServices {
    func meters(_ provider: AiProvider, now: Date) -> [Meter] {
        switch provider {
        case .claude: claude.meters(now: now)
        case .codex: codex.meters(now: now)
        case .gemini: gemini.meters(now: now)
        }
    }

    func plan(_ provider: AiProvider) -> String? {
        switch provider {
        case .claude: claude.active?.tier
        case .codex: codex.plan
        case .gemini: gemini.plan
        }
    }

    func emptyMeters(_ provider: AiProvider) -> String {
        switch provider {
        case .claude: "Entre no Claude Code para ver as cotas"
        case .codex: codex.emptyMessage ?? ""
        case .gemini: gemini.emptyMessage ?? ""
        }
    }

    func quotaRevision(_ provider: AiProvider) -> Int {
        switch provider {
        case .claude: revisions.claude
        case .codex: revisions.codex
        case .gemini: revisions.gemini
        }
    }

    func refreshQuota(_ provider: AiProvider) {
        switch provider {
        case .claude: claude.refreshIfStale(maxAge: quotaMaxAge)
        case .codex: codex.refreshIfStale(maxAge: quotaMaxAge)
        case .gemini: gemini.refreshIfStale(maxAge: quotaMaxAge)
        }
    }
}

struct ProviderHeading: View {
    let provider: AiProvider
    let title: String

    var body: some View {
        HStack(spacing: 10) {
            ProviderTile(provider: provider)
            Text(title).font(Theme.Font.title()).foregroundStyle(Theme.text)
        }
    }
}

struct ProviderMeters: View {
    let provider: AiProvider
    let meters: [Meter]
    let empty: String
    let remaining: Bool
    let short: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if meters.isEmpty, !empty.isEmpty {
                Text(empty).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).fixedSize(horizontal: false, vertical: true)
            }
            ForEach(meters, id: \.key) { meter in
                MeterRow(meter: meter, remaining: remaining, provider: provider, short: short)
            }
            if provider == .gemini, !meters.isEmpty {
                Text("Estimado pelo histórico local: o Gemini CLI não informa a cota.")
                    .font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ProviderOverviewCard: View {
    let services: FrodoServices
    let provider: AiProvider
    let open: () -> Void

    var body: some View {
        let _ = services.quotaRevision(provider) + services.revisions.sessions + services.revisions.settings
        TimelineView(.periodic(from: .now, by: 30)) { context in
            card(now: context.date)
        }
        .onAppear { services.refreshQuota(provider) }
    }

    private func card(now: Date) -> some View {
        let counts = countByStatus(services.sessions.sessions.filter { $0.provider == provider }, now: now)
        return CardView {
            HStack(spacing: 8) {
                ProviderHeading(provider: provider, title: provider.name)
                Spacer(minLength: 8)
                if let plan = services.plan(provider) { Chip(text: plan) }
            }
            ProviderMeters(
                provider: provider, meters: Array(services.meters(provider, now: now).prefix(overviewMeters)), empty: services.emptyMeters(provider),
                remaining: services.settings.claudeShowRemaining, short: true
            )
            .frame(maxHeight: .infinity, alignment: .top)
            HStack(spacing: 8) {
                Text(status(counts)).font(Theme.Font.label(.medium)).foregroundStyle(statusColor(counts))
                Spacer(minLength: 8)
                TextButton(title: "Detalhes", compact: true, action: open).accessibilityLabel("Ver detalhes do \(provider.name)")
            }
        }
    }

    private func status(_ counts: StatusCounts) -> String {
        var parts: [String] = []
        if counts.working > 0 { parts.append("\(counts.working) trabalhando") }
        if counts.waiting > 0 { parts.append("\(counts.waiting) aguardando você") }
        return parts.isEmpty ? "Nenhuma sessão ativa" : parts.joined(separator: " · ")
    }

    private func statusColor(_ counts: StatusCounts) -> Color {
        if counts.waiting > 0 { return Theme.color(for: SessionStatus.waiting) }
        return counts.working > 0 ? Theme.color(for: SessionStatus.working) : Theme.textSecondary
    }
}

struct ProviderMetersCard: View {
    let services: FrodoServices
    let provider: AiProvider

    var body: some View {
        let _ = services.quotaRevision(provider) + services.revisions.settings
        TimelineView(.periodic(from: .now, by: 30)) { context in
            CardView {
                ProviderHeading(provider: provider, title: "Limites de uso")
                ProviderMeters(
                    provider: provider, meters: services.meters(provider, now: context.date), empty: services.emptyMeters(provider),
                    remaining: services.settings.claudeShowRemaining, short: false
                )
            }
        }
        .onAppear { services.refreshQuota(provider) }
    }
}
