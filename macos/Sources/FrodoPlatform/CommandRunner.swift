import Foundation

public struct CommandResult: Sendable {
    public let status: Int32
    public let output: String
}

public protocol CommandRunner: Sendable {
    func run(_ executable: String, arguments: [String], currentDirectory: String?) async -> CommandResult?
}

private final class RunningCommand: @unchecked Sendable {
    let process = Process()
    let pipe = Pipe()

    func terminateIfRunning() {
        if process.isRunning { process.terminate() }
    }
}

public struct ProcessCommandRunner: CommandRunner {
    private let timeout: TimeInterval

    public init(timeout: TimeInterval = 10) {
        self.timeout = timeout
    }

    public func run(_ executable: String, arguments: [String], currentDirectory: String? = nil) async -> CommandResult? {
        let command = RunningCommand()
        let process = command.process
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        if let currentDirectory { process.currentDirectoryURL = URL(fileURLWithPath: currentDirectory) }
        process.standardOutput = command.pipe
        process.standardError = FileHandle.nullDevice
        let timeout = timeout
        return await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<CommandResult?, Never>) in
                do {
                    try command.process.run()
                } catch {
                    continuation.resume(returning: nil)
                    return
                }
                DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout) {
                    command.terminateIfRunning()
                }
                DispatchQueue.global(qos: .utility).async {
                    let data = command.pipe.fileHandleForReading.readDataToEndOfFile()
                    command.process.waitUntilExit()
                    guard command.process.terminationReason == .exit else {
                        continuation.resume(returning: nil)
                        return
                    }
                    continuation.resume(returning: CommandResult(status: command.process.terminationStatus, output: String(decoding: data, as: UTF8.self)))
                }
            }
        } onCancel: {
            command.terminateIfRunning()
        }
    }
}
