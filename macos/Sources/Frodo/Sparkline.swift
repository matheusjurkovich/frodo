import SwiftUI

private let slots = 30
private let sparkHeight: CGFloat = 40
private let recentBars = 3
private let dimOpacity = 0.45
private let minBarHeight: CGFloat = 2

struct Sparkline: View {
    let values: [Double]

    var body: some View {
        let shown = Array(values.suffix(slots))
        let offset = slots - shown.count
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(0 ..< slots, id: \.self) { index in
                let value = index >= offset ? shown[index - offset] : 0
                RoundedRectangle(cornerRadius: 1)
                    .fill(Theme.accent)
                    .frame(maxWidth: .infinity)
                    .frame(height: max(minBarHeight, (min(1, max(0, value)) * sparkHeight).rounded()))
                    .opacity(index >= slots - recentBars ? 1 : dimOpacity)
            }
        }
        .frame(height: sparkHeight, alignment: .bottom)
    }
}
