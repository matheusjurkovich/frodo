import FrodoCore
import FrodoPlatform
import SwiftUI

private enum SessionFilter: Hashable {
    case all
    case status(SessionStatus)
}

private let filters: [(SessionFilter, String)] = [
    (.all, "Todas"), (.status(.working), "Trabalhando"), (.status(.waiting), "Aguardando"), (.status(.done), "Concluídas"), (.status(.idle), "Ociosas"),
]

struct SessionsCard: View {
    let services: FrodoServices
    let provider: AiProvider?
    @State private var filter: SessionFilter = .all
    @State private var expanded: String?

    var body: some View {
        let _ = services.revisions.sessions + services.revisions.transcripts + services.revisions.settings
        TimelineView(.periodic(from: .now, by: 30)) { context in
            card(now: context.date)
        }
        .onAppear { services.transcripts.setWanted(true) }
        .onDisappear { services.transcripts.setWanted(false) }
    }

    private func card(now: Date) -> some View {
        let states = services.sessions.sessions.filter { provider == nil || $0.provider == provider }
        let counts = countByStatus(states, now: now)
        let shown = states.filter { matches($0, now: now) }.sorted { byUrgency($0, $1, now: now) }
        return CardView(title: "Sessões") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 6, alignment: .leading)], alignment: .leading, spacing: 6) {
                ForEach(filters.indices, id: \.self) { index in
                    let option = filters[index]
                    FilterChip(title: "\(option.1) \(count(option.0, counts))", selected: filter == option.0) {
                        withAnimation(Motion.standard) { filter = option.0 }
                    }
                }
            }
            if (provider ?? .claude) == .claude, services.settings.providerEnabled(.claude), !services.sessions.hooksInstalled() { HooksSetup(services: services) }
            SwapContainer(key: filter, index: filters.firstIndex { $0.0 == filter } ?? 0) {
                VStack(spacing: 8) {
                    if shown.isEmpty {
                        empty(none: states.isEmpty)
                    } else {
                        ForEach(shown, id: \.sessionId) { state in
                            SessionRow(services: services, state: state, now: now, expanded: expanded == state.sessionId) {
                                withAnimation(Motion.standard) { expanded = expanded == state.sessionId ? nil : state.sessionId }
                            }
                        }
                    }
                }
            }
        } trailing: {
            if counts.all > 0 {
                Text("\(counts.all) \(counts.all == 1 ? "sessão" : "sessões") · \(counts.working) trabalhando")
                    .font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            }
        }
    }

    private func empty(none: Bool) -> some View {
        VStack(spacing: 6) {
            Text(none ? "Nenhuma sessão ativa" : "Nenhuma sessão neste filtro agora.").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
            if none, let provider, provider != .claude {
                Text("Instale o hook em Configurações › IA para ver as sessões aqui").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 60)
    }

    private func matches(_ state: SessionState, now: Date) -> Bool {
        switch filter {
        case .all: true
        case let .status(status): displayStatus(state, now: now) == status
        }
    }

    private func count(_ filter: SessionFilter, _ counts: StatusCounts) -> Int {
        switch filter {
        case .all: counts.all
        case .status(.working): counts.working
        case .status(.waiting): counts.waiting
        case .status(.done): counts.done
        case .status(.idle): counts.idle
        }
    }
}
