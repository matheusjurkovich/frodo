import Foundation

public struct CpuTimes: Equatable, Sendable {
    public let busy: UInt64
    public let total: UInt64

    public init(busy: UInt64, total: UInt64) {
        self.busy = busy
        self.total = total
    }
}

public enum ProcessSort: String, CaseIterable, Sendable {
    case cpu
    case ram

    public var label: String {
        switch self {
        case .cpu: "CPU"
        case .ram: "RAM"
        }
    }
}

private let protectedProcessNames: Set<String> = [
    "launchd", "WindowServer", "loginwindow", "kernel_task", "Dock", "Finder", "SystemUIServer", "Frodo",
]

private let gibibyte = 1_073_741_824.0
private let mebibyte = 1_048_576.0

public func cpuUsage(_ previous: CpuTimes, _ next: CpuTimes) -> Double {
    let total = Double(next.total) - Double(previous.total)
    guard total > 0 else { return 0 }
    return min(1, max(0, (Double(next.busy) - Double(previous.busy)) / total))
}

public func processCpu(previousNanos: UInt64?, nanos: UInt64, elapsedSeconds: Double, cores: Int) -> Double {
    guard let previousNanos, elapsedSeconds > 0, nanos >= previousNanos else { return 0 }
    return Double(nanos - previousNanos) / (elapsedSeconds * 1e9 * Double(max(1, cores)))
}

public func isProtected(name: String, uid: UInt32, ownUid: UInt32) -> Bool {
    uid != ownUid || protectedProcessNames.contains(name)
}

public func topBy<T>(_ items: [T], count: Int, value: (T) -> Double) -> [T] {
    let scored = items.enumerated().map { (index: $0.offset, score: value($0.element), item: $0.element) }
    let sorted = scored.sorted { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
    return sorted.prefix(max(0, count)).map(\.item)
}

public func pushHistory(_ history: [Double], _ value: Double, size: Int) -> [Double] {
    Array((history + [value]).suffix(size))
}

private func fixedDecimal(_ value: Double) -> String {
    String(format: "%.1f", value).replacingOccurrences(of: ".", with: ",")
}

public func formatBytes(_ bytes: Double) -> String {
    if bytes >= 100 * gibibyte { return "\(Int((bytes / gibibyte).rounded())) GB" }
    if bytes >= gibibyte { return "\(fixedDecimal(bytes / gibibyte)) GB" }
    return "\(Int((bytes / mebibyte).rounded())) MB"
}

public func formatRate(_ bytesPerSecond: Double) -> String {
    if bytesPerSecond >= mebibyte { return "\(Int((bytesPerSecond / mebibyte).rounded())) MB/s" }
    return "\(Int((bytesPerSecond / 1024).rounded())) kB/s"
}

public func formatPercent(_ fraction: Double) -> String {
    "\(fixedDecimal(fraction * 100))%"
}

public func monogram(_ name: String) -> String {
    let letters = Array(name.filter { $0.isLetter || $0.isNumber })
    let first = letters.first.map { String($0).uppercased() } ?? ""
    let second = letters.count > 1 ? String(letters[1]).lowercased() : ""
    return first + second
}
