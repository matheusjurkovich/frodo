public enum Level: Int, Comparable, Sendable {
    case ok
    case warn
    case crit

    public static func < (lhs: Level, rhs: Level) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}
