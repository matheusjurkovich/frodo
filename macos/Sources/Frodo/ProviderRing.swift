import FrodoCore
import SwiftUI

struct ProviderRing: View {
    let provider: AiProvider
    let percent: Double
    let size: CGFloat
    var level: FrodoLevel?

    var body: some View {
        let line = size * Theme.Size.ringLine / Theme.Size.ringBase
        let fraction = min(1, max(0, percent / 100))
        ZStack {
            Circle().inset(by: line / 2).stroke(Theme.track, lineWidth: line)
            Circle().inset(by: line / 2).trim(from: 0, to: fraction)
                .stroke(Theme.color(for: provider, level: level ?? meterLevel(percent)), lineWidth: line)
                .rotationEffect(.degrees(-90))
        }
        .frame(width: size, height: size)
        .animation(Motion.soft, value: fraction)
    }
}
