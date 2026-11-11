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

struct ConsumptionCard: View {
    let services: FrodoServices
    @State private var period: PeriodChoice = .today

    var body: some View {
        let _ = services.revisions.transcripts
        let summary = services.transcripts.summary(period.period)
        CardView(title: "Consumo") {
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
        } trailing: {
            SegmentedPicker(options: [(PeriodChoice.today, "Hoje"), (.week, "7 dias"), (.month, "30 dias")], selection: $period)
        }
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
            Text(value).font(Theme.Font.number()).foregroundStyle(Theme.text).monospacedDigit()
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .innerCard()
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

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    ForEach(models, id: \.name) { model in
                        Rectangle().fill(Theme.color(forModel: model.name)).frame(width: max(2, proxy.size.width * model.fraction))
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 8)
            HStack(spacing: 12) {
                ForEach(models, id: \.name) { model in
                    HStack(spacing: 5) {
                        StatusDot(color: Theme.color(forModel: model.name), size: 7)
                        Text("\(model.label) \(Int((model.fraction * 100).rounded()))%").font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                    }
                }
            }
        }
    }
}
