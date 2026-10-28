public enum ActivityKind: CaseIterable, Sendable {
    case notification
    case recording
    case claudePermission
    case claudeWaiting
    case meeting
    case volume
    case claudeWorking
    case media

    public var priority: Int {
        Self.allCases.firstIndex(of: self) ?? Self.allCases.count
    }
}

public protocol ActivityKinded {
    var kind: ActivityKind { get }
}

public func pickActivity<Candidate: ActivityKinded>(_ candidates: [Candidate]) -> Candidate? {
    candidates.reduce(nil as Candidate?) { best, candidate in
        guard let best else { return candidate }
        return candidate.kind.priority < best.kind.priority ? candidate : best
    }
}
