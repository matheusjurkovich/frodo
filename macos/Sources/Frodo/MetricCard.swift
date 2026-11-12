import SwiftUI

private let highUsage = 0.85

struct MetricCard: View {
    enum Graph {
        case spark([Double])
        case bar(Double)
    }

    let title: String
    var tag = ""
    let value: String
    var unit = ""
    let graph: Graph
    var first = ""
    var second = ""

    var body: some View {
        CardView(title: title) {
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(value).font(.system(size: 26, weight: .medium)).foregroundStyle(Theme.text).monospacedDigit().lineLimit(1)
                if !unit.isEmpty { Text(unit).font(Theme.Font.secondary()).foregroundStyle(Theme.textSecondary).lineLimit(1) }
            }
            switch graph {
            case .spark(let values):
                Sparkline(values: values)
            case .bar(let fraction):
                ProgressBar(fraction: fraction, tint: fraction >= highUsage ? Theme.Performance.high : Theme.accent, height: 6).padding(.vertical, 17)
            }
            HStack(spacing: 8) {
                Text(first)
                Spacer(minLength: 0)
                Text(second)
            }
            .font(Theme.Font.label())
            .foregroundStyle(Theme.textSecondary)
            .lineLimit(1)
        } trailing: {
            if !tag.isEmpty { Chip(text: tag) }
        }
    }
}
