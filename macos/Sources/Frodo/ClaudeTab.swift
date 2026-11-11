import FrodoCore
import FrodoPlatform
import SwiftUI

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
