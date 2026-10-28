import Foundation

public struct SpringSpec: Equatable, Sendable {
    public let damping: Double
    public let milliseconds: Double

    public init(damping: Double, milliseconds: Double) {
        self.damping = damping
        self.milliseconds = milliseconds
    }

    public static let standard = SpringSpec(damping: 0.58, milliseconds: 560)
    public static let gentle = SpringSpec(damping: 0.68, milliseconds: 500)
    public static let soft = SpringSpec(damping: 0.78, milliseconds: 420)
    public static let firm = SpringSpec(damping: 1, milliseconds: 420)
}

private let peakSamples = 200

public func springProgress(damping: Double, at t: Double) -> Double {
    if t <= 0 { return 0 }
    if t >= 1 { return 1 }
    if damping >= 1 { return 1 - pow(1 - t, 3) }
    let naturalFrequency = 4 / damping
    let dampedFrequency = naturalFrequency * (1 - damping * damping).squareRoot()
    let decay = exp(-damping * naturalFrequency * t)
    let oscillation = cos(dampedFrequency * t) + (damping * naturalFrequency / dampedFrequency) * sin(dampedFrequency * t)
    return 1 - decay * oscillation
}

public func springPeak(damping: Double) -> Double {
    (0 ... peakSamples).map { springProgress(damping: damping, at: Double($0) / Double(peakSamples)) }.max() ?? 0
}

public func springWithin(_ spring: SpringSpec, from: Double, to: Double, ceiling: Double) -> SpringSpec {
    let overshootTarget = from + (to - from) * springPeak(damping: spring.damping)
    return overshootTarget <= ceiling ? spring : SpringSpec(damping: 1, milliseconds: spring.milliseconds)
}
