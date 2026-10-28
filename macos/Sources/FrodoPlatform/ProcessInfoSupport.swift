import AppKit
import Darwin

public func processIsAlive(_ pid: Int) -> Bool {
    kill(pid_t(pid), 0) == 0 || errno == EPERM
}

public func parentProcessId(of pid: Int) -> Int? {
    var info = proc_bsdinfo()
    let size = Int32(MemoryLayout<proc_bsdinfo>.size)
    guard proc_pidinfo(pid_t(pid), PROC_PIDTBSDINFO, 0, &info, size) == size else { return nil }
    return Int(info.pbi_ppid)
}

@MainActor
public func activateApplicationOwning(pid: Int) -> Bool {
    var current: Int? = pid
    while let candidate = current, candidate > 1 {
        if let application = NSRunningApplication(processIdentifier: pid_t(candidate)), application.activationPolicy == .regular {
            return application.activate()
        }
        current = parentProcessId(of: candidate)
    }
    return false
}

public func findProgram(_ name: String) -> String? {
    let directories = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] + (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map(String.init)
    return directories.map { "\($0)/\(name)" }.first { FileManager.default.isExecutableFile(atPath: $0) }
}
