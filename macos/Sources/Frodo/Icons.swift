import AppKit
import FrodoCore
import SwiftUI

@MainActor
enum IconStore {
    private static var cache: [String: NSImage] = [:]

    static var directory: URL? {
        if let resources = Bundle.main.resourceURL?.appendingPathComponent("icons"), FileManager.default.fileExists(atPath: resources.path) { return resources }
        let development = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("shared/icons")
        return FileManager.default.fileExists(atPath: development.path) ? development : nil
    }

    static func image(_ name: String) -> NSImage? {
        if let cached = cache[name] { return cached }
        guard let url = directory?.appendingPathComponent("frodo-\(name)-symbolic.svg"), let image = NSImage(contentsOf: url) else { return nil }
        image.isTemplate = true
        cache[name] = image
        return image
    }
}

struct FrodoIcon: View {
    let name: String
    var size: CGFloat = 16
    var color: Color = Theme.text
    var system: String?

    var body: some View {
        Group {
            if let system {
                Image(systemName: system).resizable().aspectRatio(contentMode: .fit)
            } else if let image = IconStore.image(name) {
                Image(nsImage: image).resizable().renderingMode(.template).aspectRatio(contentMode: .fit)
            } else {
                Image(systemName: "questionmark.circle").resizable().aspectRatio(contentMode: .fit)
            }
        }
        .foregroundStyle(color)
        .frame(width: size, height: size)
    }
}

struct ProviderIcon: View {
    let provider: AiProvider
    var size: CGFloat = 16

    var body: some View {
        FrodoIcon(name: provider.rawValue, size: size, color: Theme.color(for: provider))
    }
}

struct ProviderTile: View {
    let provider: AiProvider
    var size: CGFloat = 28

    var body: some View {
        ProviderIcon(provider: provider, size: size * 0.57)
            .frame(width: size, height: size)
            .background(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous).fill(Theme.color(for: provider).opacity(0.16)))
    }
}
