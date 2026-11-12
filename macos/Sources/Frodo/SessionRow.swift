import FrodoCore
import FrodoPlatform
import SwiftUI

struct SessionRow: View {
    let services: FrodoServices
    let state: SessionState
    let now: Date
    let expanded: Bool
    let toggle: () -> Void
    @State private var diff: DiffStat?

    private var gridColumns: [GridItem] {
        [GridItem(.flexible(), spacing: 12, alignment: .topLeading), GridItem(.flexible(), spacing: 12, alignment: .topLeading)]
    }

    var body: some View {
        let status = displayStatus(state, now: now)
        let stats = state.provider == .claude ? services.transcripts.index.session(state.sessionId) : nil
        let request = services.sessions.pendingFor(sessionId: state.sessionId)
        VStack(alignment: .leading, spacing: 8) {
            Button(action: toggle) { header(status: status, stats: stats, request: request) }
                .buttonStyle(.plain)
                .accessibilityLabel("\(state.repo), \(statusLabel(status))")
            if let request { permission(request) }
            if expanded {
                details(status: status, stats: stats, request: request).transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(10)
        .innerCard()
        .task(id: expanded ? services.revisions.sessions : -1) { if expanded { diff = await services.sessions.diffStat(state.sessionId) } }
    }

    private func header(status: SessionStatus, stats: SessionStats?, request: PendingRequest?) -> some View {
        let meta = [state.provider.name, sessionMeta(state, stats: stats, status: status, now: now)].filter { !$0.isEmpty }.joined(separator: " · ")
        let step = request?.tool ?? state.step
        return HStack(alignment: .top, spacing: 8) {
            StatusDot(color: Theme.color(for: status)).padding(.top, 6)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    ProviderTile(provider: state.provider, size: 20)
                    Text(state.repo).font(Theme.Font.mono(13)).foregroundStyle(Theme.text).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(statusLabel(status)).font(Theme.Font.label(.medium)).foregroundStyle(Theme.color(for: status))
                }
                Text(meta).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                if !step.isEmpty { Text(step).font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary).lineLimit(1) }
            }
            FrodoIcon(name: "expand", size: 12, color: Theme.textSecondary)
                .rotationEffect(.degrees(expanded ? 180 : 0))
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func permission(_ request: PendingRequest) -> some View {
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

    @ViewBuilder
    private func details(status: SessionStatus, stats: SessionStats?, request: PendingRequest?) -> some View {
        let todos = stats?.todos.flatMap { $0.total > 0 ? $0 : nil }
        let usage = stats.flatMap { contextUsage($0.contextTokens) }
        let step = request?.tool ?? state.step
        VStack(alignment: .leading, spacing: 10) {
            if todos != nil || usage != nil {
                LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 12) {
                    if let todos {
                        SessionGauge(name: "Tarefas", value: "\(todos.done) de \(todos.total)", fraction: Double(todos.done) / Double(todos.total), tint: Theme.taskFill)
                    }
                    if let usage {
                        SessionGauge(name: "Contexto", value: "\(Int((usage.fraction * 100).rounded()))%", fraction: usage.fraction, tint: usage.warn ? Theme.warn : Theme.claude, note: usage.text)
                    }
                }
            }
            if usage?.warn == true {
                Text("Contexto quase cheio. A conversa será compactada em breve.").font(Theme.Font.label(.medium)).foregroundStyle(Theme.warn)
            }
            if stats != nil || diff != nil || !(state.tool ?? "").isEmpty {
                LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 12) {
                    if let stats { field("Tokens na sessão") { value(formatTokens(stats.tokens)) } }
                    if let diff {
                        field("Arquivos alterados") {
                            HStack(spacing: 6) {
                                value("+\(diff.added)", color: Theme.ok)
                                value("−\(diff.removed)", color: Theme.danger)
                                value("· \(diff.files) \(diff.files == 1 ? "arquivo" : "arquivos")")
                            }
                        }
                    }
                    if let tool = state.tool, !tool.isEmpty { field("Última ferramenta") { value(tool) } }
                }
            }
            if !step.isEmpty { Text(step).font(Theme.Font.mono(12)).foregroundStyle(Theme.textSecondary).lineLimit(3) }
            actions(status: status)
        }
    }

    @ViewBuilder
    private func actions(status: SessionStatus) -> some View {
        let live = status == .working || status == .waiting
        let pullRequest = status == .done && services.sessions.canOpenPullRequest()
        if live || pullRequest || status == .idle {
            HStack {
                if live { TextButton(title: "Abrir no terminal", kind: .primary, compact: true) { focus() } }
                if pullRequest {
                    TextButton(title: "Ver PR", kind: .primary, compact: true) { launchExternal { services.sessions.openPullRequest(state.sessionId) } }
                }
                if status == .idle {
                    TextButton(title: "Retomar", compact: true) { focus() }
                    TextButton(title: "Encerrar", compact: true) { services.sessions.dismiss(state.sessionId) }
                }
            }
        }
    }

    private func focus() {
        launchExternal { if !services.sessions.focus(state.sessionId) { SystemActions.openTerminal(at: state.cwd) } }
    }

    private func field<Content: View>(_ name: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(name).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            content()
        }
    }

    private func value(_ text: String, color: Color = Theme.text) -> some View {
        Text(text).font(Theme.Font.mono(12)).foregroundStyle(color).lineLimit(1)
    }

    private func statusLabel(_ status: SessionStatus) -> String {
        switch status {
        case .working: "Trabalhando"
        case .waiting: "Aguardando você"
        case .done: "Concluída"
        case .idle: "Ociosa"
        }
    }
}

private struct SessionGauge: View {
    let name: String
    let value: String
    let fraction: Double
    let tint: Color
    var note = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(name).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                Spacer(minLength: 8)
                Text(value).font(Theme.Font.label(.medium)).foregroundStyle(Theme.text).monospacedDigit()
            }
            ProgressBar(fraction: fraction, tint: tint, height: 6)
            if !note.isEmpty { Text(note).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary) }
        }
    }
}
