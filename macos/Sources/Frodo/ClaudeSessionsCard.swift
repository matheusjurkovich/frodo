import FrodoCore
import FrodoPlatform
import SwiftUI

private enum SessionFilter: Hashable {
    case all
    case status(SessionStatus)
}

struct SessionsCard: View {
    let services: FrodoServices
    @State private var filter: SessionFilter = .all
    @State private var expanded: String?

    var body: some View {
        let _ = services.revisions.sessions + services.revisions.transcripts
        TimelineView(.periodic(from: .now, by: 30)) { context in
            card(now: context.date)
        }
    }

    private func card(now: Date) -> some View {
        let all = services.sessions.sessions
        let counts = countByStatus(all, now: now)
        let shown = all.filter { state in
            switch filter {
            case .all: true
            case let .status(status): displayStatus(state, now: now) == status
            }
        }
        return CardView(title: "Sessões") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 6, alignment: .leading)], alignment: .leading, spacing: 6) {
                filterChip("Todas", .all, counts.all)
                filterChip("Trabalhando", .status(.working), counts.working)
                filterChip("Aguardando", .status(.waiting), counts.waiting)
                filterChip("Concluídas", .status(.done), counts.done)
                filterChip("Ociosas", .status(.idle), counts.idle)
            }
            if !services.sessions.hooksInstalled() { HooksSetup(services: services) }
            if shown.isEmpty {
                Text(all.isEmpty ? "Nenhuma sessão do Claude Code aberta." : "Nenhuma sessão neste filtro.").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 60)
            } else {
                ForEach(shown, id: \.sessionId) { state in
                    SessionRow(services: services, state: state, now: now, expanded: expanded == state.sessionId) {
                        withAnimation(Motion.standard) { expanded = expanded == state.sessionId ? nil : state.sessionId }
                    }
                }
            }
        }
    }

    private func filterChip(_ title: String, _ value: SessionFilter, _ count: Int) -> some View {
        FilterChip(title: "\(title) \(count)", selected: filter == value) {
            withAnimation(Motion.standard) { filter = value }
        }
    }
}

private struct SessionRow: View {
    let services: FrodoServices
    let state: SessionState
    let now: Date
    let expanded: Bool
    let toggle: () -> Void
    @State private var diff: DiffStat?

    var body: some View {
        let status = displayStatus(state, now: now)
        let stats = services.transcripts.index.session(state.sessionId)
        let request = services.sessions.pendingFor(sessionId: state.sessionId)
        VStack(alignment: .leading, spacing: 8) {
            Button(action: toggle) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        StatusDot(color: Theme.color(for: status))
                        Text(state.repo).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                        Text(statusLabel(status)).font(Theme.Font.label(.medium)).foregroundStyle(Theme.color(for: status))
                        Spacer()
                    }
                    let meta = sessionMeta(state, stats: stats, status: status, now: now)
                    if !meta.isEmpty { Text(meta).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary) }
                    if !state.step.isEmpty, status != .idle { Text(state.step).font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary).lineLimit(1) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if let request {
                VStack(alignment: .leading, spacing: 8) {
                    Text(state.step.isEmpty ? request.tool : state.step).font(Theme.Font.mono(12)).foregroundStyle(Theme.text).lineLimit(3)
                    HStack {
                        TextButton(title: "Negar", compact: true) { services.sessions.decide(request, .deny) }
                        TextButton(title: "Aprovar", kind: .primary, compact: true) { services.sessions.decide(request, .allow) }
                    }
                }
                .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.control))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.amberBorder))
            }
            if expanded { details(status: status, stats: stats).transition(.opacity.combined(with: .move(edge: .top))) }
        }
        .padding(10)
        .innerCard()
        .task(id: expanded ? services.revisions.sessions : -1) { if expanded { diff = await services.sessions.diffStat(state.sessionId) } }
    }

    @ViewBuilder
    private func details(status: SessionStatus, stats: SessionStats?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let todos = stats?.todos { detail("Tarefas", "\(todos.done) de \(todos.total) concluídas") }
            if let stats, let usage = contextUsage(stats.contextTokens) {
                VStack(alignment: .leading, spacing: 3) {
                    detail("Contexto", usage.text)
                    ProgressBar(fraction: usage.fraction, tint: usage.warn ? Theme.warn : Theme.claude, height: 6)
                }
            }
            if let stats { detail("Tokens", formatTokens(stats.tokens)) }
            if let diff { detail("Arquivos", "\(diff.files) alterados  +\(diff.added) −\(diff.removed)") }
            if let tool = state.tool { detail("Última ferramenta", tool) }
            HStack {
                if status == .working || status == .waiting {
                    TextButton(title: "Abrir no terminal", compact: true) {
                        launchExternal { if !services.sessions.focus(state.sessionId) { SystemActions.openTerminal(at: state.cwd) } }
                    }
                }
                if status == .done, services.sessions.canOpenPullRequest() {
                    TextButton(title: "Ver PR", compact: true) { launchExternal { services.sessions.openPullRequest(state.sessionId) } }
                }
                if status == .idle || status == .done {
                    TextButton(title: "Dispensar", compact: true) { services.sessions.dismiss(state.sessionId) }
                }
            }
        }
    }

    private func detail(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            Spacer()
            Text(value).font(Theme.Font.label(.medium)).foregroundStyle(Theme.text)
        }
    }

    private func statusLabel(_ status: SessionStatus) -> String {
        switch status {
        case .working: "trabalhando"
        case .waiting: "aguardando"
        case .done: "concluída"
        case .idle: "ociosa"
        }
    }
}
