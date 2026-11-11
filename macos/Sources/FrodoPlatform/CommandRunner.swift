import Foundation

public struct CommandResult: Sendable {
    public let status: Int32
    public let output: String
}

public protocol CommandRunner: Sendable {
    func run(_ executable: String, arguments: [String], currentDirectory: String?) async -> CommandResult?
}

public struct ProcessCommandRunner: CommandRunner {
    private let timeout: TimeInterval

    public init(timeout: TimeInterval = 10) {
        self.timeout = timeout
    }

    public func run(_ executable: String, arguments: [String], currentDirectory: String? = nil) async -> CommandResult? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        if let currentDirectory { process.currentDirectoryURL = URL(fileURLWithPath: currentDirectory) }
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        let timeout = timeout
        return await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<CommandResult?, Never>) in
                do {
                    try process.run()
                } catch {
                    continuation.resume(returning: nil)
                    return
                }
                DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout) {
                    if process.isRunning { process.terminate() }
                }
                DispatchQueue.global(qos: .utility).async {
                    let data = pipe.fileHandleForReading.readDataToEndOfFile()
                    process.waitUntilExit()
                    guard process.terminationReason == .exit else {
                        continuation.resume(returning: nil)
                        return
                    }
                    continuation.resume(returning: CommandResult(status: process.terminationStatus, output: String(decoding: data, as: UTF8.self)))
                }
            }
        } onCancel: {
            if process.isRunning { process.terminate() }
        }
    }
}
