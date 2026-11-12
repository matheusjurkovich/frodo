import FrodoCore
import SwiftUI

private struct PeriodText {
    let period: Period
    let label: String
    let chart: String
}

private let periods = [
    PeriodText(period: .today, label: "Hoje", chart: "Tokens por hora · hoje"),
    PeriodText(period: .week, label: "7 dias", chart: "Tokens por dia · últimos 7 dias"),
    PeriodText(period: .month, label: "30 dias", chart: "Tokens por dia · últimos 30 dias"),
]

struct ConsumptionCard<Source: ConsumptionSource>: View {
    let source: Source
    let provider: AiProvider
    let revision: Int
    @State private var period: Period = .today

    var body: some View {
        let summary = source.summary(period)
        let reading = source.scanning && summary.sessions == 0 && source.summary(.month).sessions == 0
        let index = periods.firstIndex { $0.period == period } ?? 0
        CardView(title: "Consumo") {
            if reading {
                Text("Lendo histórico…").font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary)
            } else {
                SwapContainer(key: period, index: index) { content(summary, text: periods[index]) }
            }
        } trailing: {
            SegmentedPicker(options: periods.map { ($0.period, $0.label) }, selection: $period)
        }
        .onAppear { source.setWanted(true) }
        .onDisappear { source.setWanted(false) }
    }

    private func content(_ summary: ConsumptionSummary, text: PeriodText) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                stat("Entrada", formatTokens(summary.input))
                stat("Saída", formatTokens(summary.output))
                stat("Cache lido", formatTokens(summary.cacheRead))
                stat("Sessões", "\(summary.sessions)")
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(text.chart).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                    Spacer(minLength: 8)
                    Text("\(text.label): \(formatTokens(summary.total))").font(Theme.Font.label(.medium)).foregroundStyle(Theme.text).monospacedDigit()
                }
                BarChart(bars: summary.bars, provider: provider).frame(height: 96)
            }
            if !summary.models.isEmpty {
                section("Por modelo") { ModelsBar(models: summary.models) }
            }
            if !summary.projects.isEmpty {
                section("Por projeto") { ProjectList(projects: summary.projects, provider: provider) }
            }
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(Theme.Font.label(.medium)).foregroundStyle(Theme.textSecondary)
            content()
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
    let provider: AiProvider

    var body: some View {
        let maximum = max(1, bars.map(\.value).max() ?? 1)
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(bars.indices, id: \.self) { index in
                let bar = bars[index]
                VStack(spacing: 4) {
                    Spacer(minLength: 0)
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(Theme.color(forBar: bar, provider: provider))
                        .frame(height: max(3, 64 * CGFloat(bar.value) / CGFloat(maximum)))
                    Text(bar.label).font(.system(size: 9)).foregroundStyle(bar.current ? Theme.text : Theme.textSecondary).lineLimit(1).frame(height: 12)
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
            WrapLayout(spacing: 12, lineSpacing: 6) {
                ForEach(models, id: \.name) { model in
                    HStack(spacing: 5) {
                        StatusDot(color: Theme.color(forModel: model.name), size: 7)
                        Text(model.label).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary)
                        Text("\(Int((model.fraction * 100).rounded()))%").font(Theme.Font.mono(11)).foregroundStyle(Theme.text)
                    }
                }
            }
        }
    }
}

private struct ProjectList: View {
    let projects: [Share]
    let provider: AiProvider

    var body: some View {
        let largest = projects.map(\.tokens).max() ?? 0
        VStack(spacing: 6) {
            ForEach(projects, id: \.name) { project in
                HStack(spacing: 8) {
                    Text(project.name).font(Theme.Font.mono(12)).foregroundStyle(Theme.text).lineLimit(1).frame(width: 140, alignment: .leading)
                    ProgressBar(fraction: largest > 0 ? Double(project.tokens) / Double(largest) : 0, tint: Theme.color(for: provider), height: 6)
                    Text("\(formatTokens(project.tokens)) · \(Int((project.fraction * 100).rounded()))%").font(Theme.Font.label())
                        .foregroundStyle(Theme.textSecondary).monospacedDigit().frame(width: 96, alignment: .trailing)
                }
            }
        }
    }
}
