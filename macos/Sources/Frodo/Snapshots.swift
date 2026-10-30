import AppKit
import FrodoCore
import FrodoPlatform
import SwiftUI

@MainActor
enum Snapshots {
    static func run(into directory: String) {
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        let demo = DemoMode()
        let services = demo.services
        services.transcripts.setWanted(true)
        Task { @MainActor in
            await services.transcripts.scan()
            await services.claude.refresh(force: true)
            try? await Task.sleep(for: .milliseconds(600))
            render(services, into: directory)
            exit(0)
        }
    }

    private static func render(_ services: FrodoServices, into directory: String) {
        let now = Date()
        let session = SessionState(
            sessionId: "loja", cwd: "/Users/demo/loja-api", repo: "loja-api", status: .working, tool: "Edit", step: "Edit cart.ts", pid: 1, since: now.addingTimeInterval(-84), updatedAt: now
        )
        let request = PendingRequest(key: "loja.r1", sessionId: "loja", request: "r1", pid: 1, tool: "Bash", since: now)
        let permissionSession = SessionState(
            sessionId: "loja", cwd: "/Users/demo/loja-api", repo: "loja-api", status: .waiting, tool: "Bash", step: "Bash rm -rf node_modules && npm ci", pid: 1, since: now, updatedAt: now
        )
        let pills: [(String, PillActivity?)] = [
            ("pilula-repouso", nil),
            ("pilula-notificacao", .notification(InterceptedNotification(app: "Claude Code", title: "docs-site", body: "Esperando você"))),
            ("pilula-permissao", .claudePermission(session: permissionSession, request: request)),
            ("pilula-trabalhando", .claudeWorking(session: session)),
            ("pilula-volume", .volume(percent: 60)),
            ("pilula-musica", .media(MediaTrack(title: "Blue in Green", artist: "Miles Davis", app: "Spotify"))),
            ("pilula-reuniao", .meeting(title: "Daily do time", startsAt: now.addingTimeInterval(300))),
        ]
        for (name, activity) in pills {
            let model = IslandModel()
            model.activity = activity
            write(IslandRootView(services: services, model: model, onToggle: {}, onClose: {}), model: model, size: CGSize(width: 760, height: 90), name: name, directory: directory)
        }
        for (name, activity) in pills where ["pilula-repouso", "pilula-notificacao", "pilula-permissao", "pilula-reuniao", "pilula-trabalhando"].contains(name) {
            let model = IslandModel()
            model.position = .middleLeft
            model.activity = activity
            writeWindow(IslandRootView(services: services, model: model, onToggle: {}, onClose: {}), size: CGSize(width: 440, height: 520), name: name.replacingOccurrences(of: "pilula-", with: "pilula-vertical-"), directory: directory)
        }
        for (name, position, size) in [("pilula-espiada", IslandPosition.topCenter, CGSize(width: 760, height: 90)), ("pilula-vertical-espiada", .middleLeft, CGSize(width: 440, height: 520))] {
            let model = IslandModel()
            model.position = position
            model.peek = PeekState(startedAt: now, seconds: 10)
            writeWindow(IslandRootView(services: services, model: model, onToggle: {}, onClose: {}), size: size, name: name, directory: directory)
        }
        let tabs: [(String, TabId, SettingsSection?)] = [("ilha-geral", .general, nil), ("ilha-calendario", .calendar, nil), ("ilha-claude", .claude, nil), ("ilha-notificacoes", .notifications, nil)]
            + SettingsSection.allCases.map { ("ilha-configuracoes-\($0.rawValue)", TabId.general, $0) }
        for (name, tab, section) in tabs {
            let model = IslandModel()
            model.isOpen = true
            model.tab = tab
            model.settingsOpen = section != nil
            model.settingsSection = section ?? .general
            writeWindow(IslandRootView(services: services, model: model, onToggle: {}, onClose: {}), size: CGSize(width: 1000, height: 860), name: name, directory: directory)
        }
        let settings = services.settings
        let pillScenes: [(String, ClosedMode, [ClosedItem], Bool)] = [
            ("minimo", .minimal, [.clock], false),
            ("rotativo", .rotating, [.clock, .battery, .ram, .claudeSession], true),
            ("ordem", .compact, [.battery, .clock, .ram, .claudeSession], true),
        ]
        for (name, mode, items, ramPercent) in pillScenes {
            settings.closedMode = mode
            settings.closedItems = items
            settings.ramPercent = ramPercent
            let model = IslandModel()
            model.isOpen = true
            model.settingsOpen = true
            model.settingsSection = .pill
            writeWindow(IslandRootView(services: services, model: model, onToggle: {}, onClose: {}), size: CGSize(width: 1000, height: 860), name: "ilha-configuracoes-pill-\(name)", directory: directory)
        }
        settings.closedMode = .compact
        settings.closedItems = [.clock, .date, .notifications, .battery]
        settings.ramPercent = false
        let placements: [(String, IslandPosition, Bool)] = [
            ("posicao-embaixo-direita-pilula", .bottomRight, false), ("posicao-meio-esquerda-pilula", .middleLeft, false),
            ("posicao-meio-esquerda-ilha", .middleLeft, true), ("posicao-embaixo-meio-ilha", .bottomCenter, true),
        ]
        for (name, position, isOpen) in placements {
            let model = IslandModel()
            model.position = position
            model.isOpen = isOpen
            writeWindow(IslandRootView(services: services, model: model, onToggle: {}, onClose: {}), size: CGSize(width: 1000, height: 860), name: name, directory: directory)
        }
        for style in [SurfaceStyle.frosted, .clear] {
            Surface.shared.style = style
            let scenes: [(String, Bool, Bool)] = [("pilula", false, false), ("ilha-geral", true, false), ("ilha-configuracoes-display", true, true)]
            for (scene, isOpen, settingsOpen) in scenes {
                let model = IslandModel()
                model.isOpen = isOpen
                model.settingsOpen = settingsOpen
                model.settingsSection = .display
                let view = IslandRootView(services: services, model: model, onToggle: {}, onClose: {}).environment(\.glassEnabled, false)
                writeWindow(view, size: CGSize(width: 1000, height: 860), name: "fundo-\(style.rawValue)-\(scene)", directory: directory, striped: true)
            }
        }
        Surface.shared.style = .solid
        print("frodo snapshot: imagens em \(directory)")
    }

    private static func write(_ view: IslandRootView, model: IslandModel, size: CGSize, name: String, directory: String, passes: Int = 1) {
        let canvas = view.frame(width: size.width, height: size.height, alignment: .top).background(Color(white: 0.32))
        let renderer = ImageRenderer(content: canvas)
        renderer.scale = 2
        for _ in 0 ..< passes {
            _ = renderer.nsImage
            RunLoop.main.run(until: Date().addingTimeInterval(0.35))
        }
        guard let image = renderer.nsImage, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
            let png = bitmap.representation(using: .png, properties: [:])
        else { return }
        try? png.write(to: URL(fileURLWithPath: "\(directory)/\(name).png"))
    }

    private static func writeWindow<Content: View>(_ view: Content, size: CGSize, name: String, directory: String, striped: Bool = false) {
        let backdrop = AnyView(striped ? AnyView(Stripes()) : AnyView(Color(white: 0.32)))
        let canvas = AnyView(view.frame(width: size.width, height: size.height, alignment: .top).background(backdrop))
        let hosting = NSHostingView(rootView: canvas)
        hosting.frame = NSRect(origin: .zero, size: size)
        let window = NSWindow(contentRect: NSRect(origin: CGPoint(x: -6000, y: -6000), size: size), styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = hosting
        window.orderFrontRegardless()
        RunLoop.main.run(until: Date().addingTimeInterval(1.2))
        hosting.layoutSubtreeIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.4))
        guard let bitmap = hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds) else { return }
        hosting.cacheDisplay(in: hosting.bounds, to: bitmap)
        if let png = bitmap.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: "\(directory)/\(name).png")) }
        window.orderOut(nil)
    }
}

private struct AppIconArt: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 230, style: .continuous).fill(LinearGradient(colors: [Color(hex: 0x1F1F23), Color(hex: 0x0A0A0B)], startPoint: .top, endPoint: .bottom))
            Capsule().fill(Color(hex: 0x000000)).overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 6)).frame(width: 640, height: 190).offset(y: -150)
            Circle().fill(Theme.claude).frame(width: 74, height: 74).offset(x: -230, y: -150)
            Capsule().fill(Color.white.opacity(0.85)).frame(width: 220, height: 22).offset(x: 40, y: -150)
            RoundedRectangle(cornerRadius: 120, style: .continuous).fill(Color(hex: 0x17171A)).overlay(RoundedRectangle(cornerRadius: 120, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 6)).frame(width: 760, height: 380).offset(y: 150)
            Circle().fill(Theme.claude).frame(width: 96, height: 96).offset(x: -250, y: 90)
        }
        .frame(width: 1024, height: 1024)
    }
}

extension Snapshots {
    static func writeIconSet(into directory: String) {
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        let sizes: [(String, CGFloat)] = [
            ("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64), ("icon_128x128", 128), ("icon_128x128@2x", 256),
            ("icon_256x256", 256), ("icon_256x256@2x", 512), ("icon_512x512", 512), ("icon_512x512@2x", 1024),
        ]
        for (name, pixels) in sizes {
            let renderer = ImageRenderer(content: AppIconArt().scaleEffect(pixels / 1024).frame(width: pixels, height: pixels))
            renderer.scale = 1
            guard let image = renderer.nsImage, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
                let png = bitmap.representation(using: .png, properties: [:])
            else { continue }
            try? png.write(to: URL(fileURLWithPath: "\(directory)/\(name).png"))
        }
    }
}

private struct Stripes: View {
    var body: some View {
        HStack(spacing: 0) {
            ForEach(0 ..< 20, id: \.self) { index in
                [Color(hex: 0xE5484D), Color(hex: 0x3E63DD), Color(hex: 0xF5D90A), Color(hex: 0x30A46C)][index % 4]
            }
        }
    }
}
