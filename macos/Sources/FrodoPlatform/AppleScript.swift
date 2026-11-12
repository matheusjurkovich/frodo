import Foundation

public let automationDeniedError = -1743

private let scriptQueue = DispatchQueue(label: "frodo.applescript")

public func runAppleScript(_ source: String) async -> Int? {
    await withCheckedContinuation { (continuation: CheckedContinuation<Int?, Never>) in
        scriptQueue.async {
            var error: NSDictionary?
            NSAppleScript(source: source)?.executeAndReturnError(&error)
            continuation.resume(returning: (error?[NSAppleScript.errorNumber] as? NSNumber)?.intValue)
        }
    }
}

public func evaluateAppleScript<Value: Sendable>(_ source: String, _ read: @escaping @Sendable (NSAppleEventDescriptor) -> Value?) async -> Value? {
    await withCheckedContinuation { (continuation: CheckedContinuation<Value?, Never>) in
        scriptQueue.async {
            var error: NSDictionary?
            let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
            continuation.resume(returning: error == nil ? result.flatMap(read) : nil)
        }
    }
}
