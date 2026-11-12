import Foundation

public func volumeLabel(level: Double, muted: Bool) -> String {
    muted ? "Mudo" : "\(Int((level * 100).rounded()))%"
}

public func playingSummary(_ count: Int) -> String {
    count == 0 ? "Nada tocando" : "\(count) tocando"
}
