import FrodoCore
import FrodoPlatform
import SwiftUI

struct AiTab: View {
    let services: FrodoServices
    @State private var selected: AiView = .all

    var body: some View {
        let _ = services.revisions.settings
        let enabled = AiProvider.allCases.filter { services.settings.providerEnabled($0) }
        let view = selected.shown(enabled: enabled)
        VStack(alignment: .leading, spacing: 10) {
            ProviderPicker(enabled: enabled, selection: Binding(get: { view }, set: { selected = $0 }))
            SwapContainer(key: view, index: view.index) {
                content(view, enabled: enabled)
            }
        }
        .onAppear { services.sessions.refreshHooksInstalled() }
    }

    @ViewBuilder
    private func content(_ view: AiView, enabled: [AiProvider]) -> some View {
        switch view {
        case .all:
            VStack(spacing: 10) {
                if !enabled.isEmpty {
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(enabled, id: \.self) { provider in
                            ProviderOverviewCard(services: services, provider: provider) {
                                withAnimation(Motion.standard) { selected = .provider(provider) }
                            }
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                SessionsCard(services: services, provider: nil)
            }
        case let .provider(provider):
            HStack(alignment: .top, spacing: 10) {
                VStack(spacing: 10) { details(provider) }
                SessionsCard(services: services, provider: provider).frame(width: 420)
            }
        }
    }

    @ViewBuilder
    private func details(_ provider: AiProvider) -> some View {
        switch provider {
        case .claude:
            LimitsCard(services: services)
            ConsumptionCard(source: services.transcripts, provider: .claude, revision: services.revisions.transcripts)
        case .codex:
            ProviderMetersCard(services: services, provider: .codex)
            ConsumptionCard(source: services.codex, provider: .codex, revision: services.revisions.codex)
        case .gemini:
            ProviderMetersCard(services: services, provider: .gemini)
            ConsumptionCard(source: services.gemini, provider: .gemini, revision: services.revisions.gemini)
        }
    }
}
