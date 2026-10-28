import AppKit

@MainActor
public enum SystemActions {
    private static func runAppleScript(_ source: String) {
        NSAppleScript(source: source)?.executeAndReturnError(nil)
    }

    private static func run(_ executable: String, _ arguments: [String]) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        try? process.run()
    }

    public static func sleep() { run("/usr/bin/pmset", ["sleepnow"]) }
    public static func lockScreen() { run("/usr/bin/pmset", ["displaysleepnow"]) }
    public static func restart() { runAppleScript("tell application \"System Events\" to restart") }
    public static func shutDown() { runAppleScript("tell application \"System Events\" to shut down") }
    public static func logOut() { runAppleScript("tell application \"System Events\" to log out") }

    public static func openScreenshotTool() {
        NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/Utilities/Screenshot.app"))
    }

    public static func openTerminal() {
        NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app"))
    }

    public static func openFinder() {
        NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Library/CoreServices/Finder.app"))
    }

    public static func openTerminal(at directory: String) {
        NSWorkspace.shared.open(
            [URL(fileURLWithPath: directory)], withApplicationAt: URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app"),
            configuration: NSWorkspace.OpenConfiguration()
        )
    }

    public static func openSystemSettings(pane: String? = nil) {
        let address = pane.map { "x-apple.systempreferences:\($0)" } ?? "x-apple.systempreferences:"
        if let url = URL(string: address) { NSWorkspace.shared.open(url) }
    }

    public static func open(_ url: URL) {
        NSWorkspace.shared.open(url)
    }
}
