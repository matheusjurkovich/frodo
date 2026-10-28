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
