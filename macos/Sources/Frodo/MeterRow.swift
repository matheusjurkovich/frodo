import FrodoCore
import SwiftUI

struct MeterRow: View {
    let meter: Meter
    let remaining: Bool
    let provider: AiProvider
    var short = false

    var body: some View {
        let level = meterLevel(meter.percent)
        let shown = shownMeterPercent(meter.percent, remaining: remaining)
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
                Text(short ? meter.short : meter.label).font(Theme.Font.secondary(.medium)).foregroundStyle(Theme.text)
                Spacer(minLength: 8)
                Text("\(Int(shown.rounded()))%").font(Theme.Font.secondary(.semibold))
                    .foregroundStyle(level == .ok ? Theme.text : Theme.color(for: level)).monospacedDigit()
            }
            ProgressBar(fraction: shown / 100, tint: Theme.color(for: provider, level: level))
            if !meter.note.isEmpty { Text(meter.note).font(Theme.Font.label()).foregroundStyle(Theme.textSecondary) }
        }
    }
}
