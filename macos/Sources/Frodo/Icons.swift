import AppKit
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
