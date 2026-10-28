public struct BatteryInfo: Equatable, Sendable {
    public let percent: Int
    public let charging: Bool

    public init(percent: Int, charging: Bool) {
        self.percent = percent
        self.charging = charging
    }
}

public enum BatteryLevel: Sendable {
    case empty
    case low
    case medium
    case high
    case full
    case charging
}

public func batteryLevel(_ battery: BatteryInfo) -> BatteryLevel {
    if battery.charging { return .charging }
    if battery.percent >= 90 { return .full }
    if battery.percent >= 60 { return .high }
    if battery.percent >= 35 { return .medium }
    if battery.percent >= 10 { return .low }
    return .empty
}
