import Foundation

public struct CommandResult: Sendable {
    public let status: Int32
    public let output: String
}

public protocol CommandRunner: Sendable {
    func run(_ executable: String, arguments: [String], currentDirectory: String?) async -> CommandResult?
}

public struct ProcessCommandRunner: CommandRunner {
    public init() {}

    public func run(_ executable: String, arguments: [String], currentDirectory: String? = nil) async -> CommandResult? {
        await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            if let currentDirectory { process.currentDirectoryURL = URL(fileURLWithPath: currentDirectory) }
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = FileHandle.nullDevice
            process.terminationHandler = { finished in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                continuation.resume(returning: CommandResult(status: finished.terminationStatus, output: String(decoding: data, as: UTF8.self)))
            }
            do {
                try process.run()
            } catch {
                continuation.resume(returning: nil)
            }
        }
    }
}
