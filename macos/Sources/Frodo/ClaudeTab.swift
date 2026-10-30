import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

private enum PeriodChoice: Hashable {
    case today
    case week
    case month

    var period: Period {
        switch self {
        case .today: .today
        case .week: .week
        case .month: .month
        }
    }
}

private enum SessionFilter: Hashable {
    case all
    case status(SessionStatus)
}

struct ClaudeTab: View {
    let services: FrodoServices

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(spacing: 10) {
                LimitsCard(services: services)
                ConsumptionCard(services: services)
            }
            SessionsCard(services: services).frame(width: 420)
        }
        .onAppear {
            services.transcripts.setWanted(true)
            services.claude.refreshIfStale(maxAge: 60)
            services.sessions.refreshHooksInstalled()
        }
        .onDisappear { services.transcripts.setWanted(false) }
    }
}

private func levelColor(_ level: FrodoLevel) -> Color {
    switch level {
    case .ok: Theme.claude
    case .warn: Theme.warn
    case .crit: Theme.dangerStrong
    }
}

private struct LimitsCard: View {
    let services: FrodoServices
    @State private var selectedProfileId: String?

    var body: some View {
        let _ = services.revisions.claude + services.revisions.settings
        let profiles = services.claude.profiles
        let usage = profiles.first { $0.profile.id == selectedProfileId } ?? services.claude.active
        CardView(
            title: "Limites de uso",
            trailing: AnyView(
                HStack(spacing: 6) {
                    if let tier = usage?.tier { Chip(text: tier, tint: Theme.claude) }
                    IconButton(icon: "refresh", size: 28, iconSize: 12, help: "Atualizar") { Task { await services.claude.refresh(force: true) } }
                }
            )
        ) {
            if profiles.count > 1 {
                HStack(spacing: 6) {
                    ForEach(profiles, id: \.profile.id) { item in
                        Button { withAnimation(Motion.standard) { selectedProfileId = item.profile.id } } label: {
                            Text(item.profile.label).font(Theme.Font.label(.medium)).foregroundStyle(item.profile.id == usage?.profile.id ? Theme.text : Theme.textSecondary)
                                .padding(.horizontal, 10).frame(height: 24)
                                .background(Capsule().fill(item.profile.id == usage?.profile.id ? Theme.controlHover : Theme.control))
                        }
                        .buttonStyle(.plain)
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
                    .foregroundStyle(level == .ok ? Theme.text : levelColor(level)).monospacedDigit().frame(width: 44, alignment: .trailing)
            }
            ProgressBar(
                fraction: remaining ? (100 - window.utilization) / 100 : window.utilization / 100, tint: levelColor(level),
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
            if let percent = spend.percent { ProgressBar(fraction: percent / 100, tint: levelColor(spend.level)) }
        }
    }
}

private struct ConsumptionCard: View {
    let services: FrodoServices
    @State private var period: PeriodChoice = .today

    var body: some View {
        let _ = services.revisions.transcripts
        let summary = services.transcripts.index.summary(period.period, now: Date())
        CardView(
            title: "Consumo",
            trailing: AnyView(SegmentedPicker(options: [(PeriodChoice.today, "Hoje"), (.week, "7 dias"), (.month, "30 dias")], selection: $period))
        ) {
            HStack(spacing: 8) {
                stat("Entrada", formatTokens(summary.input))
                stat("Saída", formatTokens(summary.output))
                stat("Cache lido", formatTokens(summary.cacheRead))
                stat("Sessões", "\(summary.sessions)")
            }
            BarChart(bars: summary.bars).frame(height: 96)
            if !summary.models.isEmpty { ModelsBar(models: summary.models) }
            if !summary.projects.isEmpty {
                VStack(spacing: 6) {
                    ForEach(summary.projects, id: \.name) { project in
                        HStack(spacing: 8) {
                            Text(project.name).font(Theme.Font.mono(12)).foregroundStyle(Theme.text).lineLimit(1).frame(width: 140, alignment: .leading)
                            ProgressBar(fraction: project.fraction, tint: Theme.claude.opacity(0.7), height: 6)
                            Text(formatTokens(project.tokens)).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary).monospacedDigit().frame(width: 60, alignment: .trailing)
                        }
                    }
                }
            }
            if services.transcripts.scanning && summary.total == 0 {
                Text("Lendo transcrições…").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            }
        }
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            Text(value).font(Theme.Font.number()).foregroundStyle(Theme.text).monospacedDigit()
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.item, style: .continuous).fill(Theme.cardInner))
    }
}

private struct BarChart: View {
    let bars: [Bar]

    var body: some View {
        let maximum = max(1, bars.map(\.value).max() ?? 1)
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(bars.indices, id: \.self) { index in
                let bar = bars[index]
                VStack(spacing: 4) {
                    Spacer(minLength: 0)
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(bar.future ? Theme.track : (bar.current ? Theme.claude : Theme.claude.opacity(0.5)))
                        .frame(height: max(3, 64 * CGFloat(bar.value) / CGFloat(maximum)))
                    Text(bar.label).font(.system(size: 9)).foregroundStyle(Theme.textSecondary).lineLimit(1).frame(height: 12)
                }
            }
        }
        .animation(Motion.soft, value: bars)
    }
}

private struct ModelsBar: View {
    let models: [Share]

    private func color(_ name: String) -> Color {
        switch name {
        case "Opus": Theme.opus
        case "Sonnet": Theme.sonnet
        case "Haiku": Theme.haiku
        default: Theme.textSecondary
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    ForEach(models, id: \.name) { model in
                        Rectangle().fill(color(model.name)).frame(width: max(2, proxy.size.width * model.fraction))
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 8)
            HStack(spacing: 12) {
                ForEach(models, id: \.name) { model in
                    HStack(spacing: 5) {
                        StatusDot(color: color(model.name), size: 7)
                        Text("\(model.label) \(Int((model.fraction * 100).rounded()))%").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                    }
                }
            }
        }
    }
}

private struct SessionsCard: View {
    let services: FrodoServices
    @State private var filter: SessionFilter = .all
    @State private var expanded: String?

    var body: some View {
        let _ = services.revisions.sessions + services.revisions.transcripts
        let now = Date()
        let all = services.sessions.sessions
        let counts = countByStatus(all, now: now)
        let shown = all.filter { state in
            switch filter {
            case .all: true
            case let .status(status): displayStatus(state, now: now) == status
            }
        }
        CardView(title: "Sessões") {
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
                    SessionRow(services: services, state: state, expanded: expanded == state.sessionId) {
                        withAnimation(Motion.standard) { expanded = expanded == state.sessionId ? nil : state.sessionId }
                    }
                }
            }
        }
    }

    private func filterChip(_ title: String, _ value: SessionFilter, _ count: Int) -> some View {
        Button { withAnimation(Motion.standard) { filter = value } } label: {
            Text("\(title) \(count)").font(Theme.Font.label(.medium)).foregroundStyle(filter == value ? Theme.text : Theme.textSecondary)
                .padding(.horizontal, 10).frame(height: 24).background(Capsule().fill(filter == value ? Theme.controlHover : Theme.control))
        }
        .buttonStyle(.plain)
    }
}

private struct SessionRow: View {
    let services: FrodoServices
    let state: SessionState
    let expanded: Bool
    let toggle: () -> Void
    @State private var diff: DiffStat?

    var body: some View {
        let now = Date()
        let status = displayStatus(state, now: now)
        let stats = services.transcripts.index.session(state.sessionId)
        let request = services.sessions.pendingFor(sessionId: state.sessionId)
        VStack(alignment: .leading, spacing: 8) {
            Button(action: toggle) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        StatusDot(color: statusColor(status))
                        Text(state.repo).font(Theme.Font.body(.medium)).foregroundStyle(Theme.text).lineLimit(1)
                        Text(statusLabel(status)).font(Theme.Font.label(.medium)).foregroundStyle(statusColor(status))
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
        .background(RoundedRectangle(cornerRadius: Theme.Radius.item, style: .continuous).fill(Theme.cardInner))
        .task(id: expanded) { if expanded { diff = await services.sessions.diffStat(state.sessionId) } }
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

    private func statusColor(_ status: SessionStatus) -> Color {
        switch status {
        case .working: Theme.claude
        case .waiting: Theme.warn
        case .done: Theme.ok
        case .idle: Theme.textSecondary
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

struct HooksSetup: View {
    let services: FrodoServices
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("O Frodo ainda não recebe eventos do Claude Code. Instale o hook e cole o bloco no settings.json de cada perfil.")
                .font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            HStack {
                TextButton(title: "Instalar hook e copiar bloco", kind: .primary, compact: true) {
                    if let path = services.installHookIfPossible() {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(hookSettingsJSON(scriptPath: path), forType: .string)
                        message = "Hook em \(path). Bloco copiado: mescle em ~/.claude/settings.json."
                    } else {
                        message = "Não achei o script do hook."
                    }
                }
            }
            if let message { Text(message).font(Theme.Font.label()).foregroundStyle(Theme.accentText) }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Theme.Radius.item, style: .continuous).fill(Theme.control))
    }
}
