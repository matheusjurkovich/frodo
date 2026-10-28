import AppKit

MainActor.assumeIsolated {
    let delegate = AppDelegate(arguments: CommandLine.arguments)
    NSApplication.shared.delegate = delegate
    NSApplication.shared.setActivationPolicy(.accessory)
    NSApplication.shared.run()
    withExtendedLifetime(delegate) {}
}
