import Foundation

public struct MemoryInfo: Equatable, Sendable {
    public let totalBytes: UInt64
    public let usedBytes: UInt64

    public init(totalBytes: UInt64, usedBytes: UInt64) {
        self.totalBytes = totalBytes
        self.usedBytes = usedBytes
    }
}

public func formatGb(_ bytes: UInt64) -> String {
    String(format: "%.1fG", Double(bytes) / 1_073_741_824)
}

public func usedPercent(_ memory: MemoryInfo) -> Int {
    guard memory.totalBytes > 0 else { return 0 }
    return Int((Double(memory.usedBytes) / Double(memory.totalBytes) * 100).rounded())
}

public func formatRam(_ memory: MemoryInfo?, percent: Bool) -> String {
    guard let memory else { return "RAM —" }
    return percent ? "RAM \(usedPercent(memory))%" : "RAM \(formatGb(memory.usedBytes))"
}
