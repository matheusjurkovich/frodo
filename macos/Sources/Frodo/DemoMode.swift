import AppKit
import FrodoCore
import FrodoPlatform

private struct DemoStore: CredentialStore {
    func read(configDir: String) async -> String? {
        let expiresAt = Int((Date().timeIntervalSince1970 + 3600) * 1000)
        return #"{"claudeAiOauth":{"accessToken":"demo","expiresAt":\#(expiresAt),"subscriptionType":"max","rateLimitTier":"default_claude_max_5x"}}"#
    }

    func exists(configDir: String) async -> Bool { true }
}

private func iso(_ date: Date) -> String {
    Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(date)
}

private func demoTransport() -> Transport {
    { request in
        if request.url == usageURL {
            let now = Date()
            let body = """
            {"limits":[
              {"kind":"session","group":"session","percent":62,"resets_at":"\(iso(now.addingTimeInterval(2 * 3600 + 600)))","is_active":true},
              {"kind":"weekly_all","group":"weekly","percent":31,"resets_at":"\(iso(now.addingTimeInterval(3 * 86400)))"},
              {"kind":"weekly_scoped","group":"weekly","percent":80,"severity":"warning","resets_at":"\(iso(now.addingTimeInterval(3 * 86400)))","scope":{"model":{"display_name":"Opus"}}}],
             "extra_usage":{"is_enabled":true,"used_credits":4165,"monthly_limit":10000,"decimal_places":2,"currency":"USD","utilization":41.6}}
            """
            return HTTPResponse(status: 200, body: body)
        }
        let profile = #"{"account":{"display_name":"Pedro","has_claude_max":true},"application":{"name":"Claude Code"},"organization":{"subscription_status":"active","rate_limit_tier":"default_claude_max_5x"}}"#
        return HTTPResponse(status: 200, body: profile)
    }
}

@MainActor
final class DemoMode {
    let services: FrodoServices
    private let paths: FrodoPaths
    private let root: String
    private let pid = Int(ProcessInfo.processInfo.processIdentifier)

    init() {
        root = NSTemporaryDirectory() + "frodo-demo"
        try? FileManager.default.removeItem(atPath: root)
        paths = FrodoPaths(home: root, runtimeDir: root + "/run", cacheDir: root + "/cache", supportDir: root + "/support")
        let suite = "br.frodo.demo"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        DemoMode.writeTranscripts(configDir: root + "/.claude")
        services = FrodoServices(paths: paths, defaults: defaults, store: DemoStore(), transport: demoTransport())
        services.settings.claudeProfiles = [ClaudeProfile(id: "demo", label: "Claude", configDir: root + "/.claude")]
        services.settings.claudeProfilesInitialized = true
        services.settings.closedItems = [.clock, .date, .notifications, .claudeSession, .battery]
        let now = Date()
        let calendar = Calendar.current
        let day = calendar.startOfDay(for: now)
        let events = [
            CalendarEvent(id: "1", title: "Daily do time", start: now.addingTimeInterval(5 * 60), end: now.addingTimeInterval(35 * 60), isAllDay: false, location: "Google Meet", colorHex: "#4285F4", meetingURL: URL(string: "https://meet.google.com/abc-defg-hij")),
            CalendarEvent(id: "2", title: "Revisão de PR com o Matheus", start: now.addingTimeInterval(3 * 3600), end: now.addingTimeInterval(4 * 3600), isAllDay: false, location: "Sala 3", colorHex: "#34A853", meetingURL: nil),
            CalendarEvent(id: "3", title: "Planejamento da sprint", start: day.addingTimeInterval(9 * 3600), end: day.addingTimeInterval(10 * 3600), isAllDay: false, location: "", colorHex: "#EA4335", meetingURL: nil),
        ]
        services.calendar.installDemo(events: events, meeting: nil, url: events[0].meetingURL)
        writeSession(id: "loja", cwd: "/Users/demo/loja-api", event: "UserPromptSubmit")
        writeSession(id: "docs", cwd: "/Users/demo/docs-site", event: "Stop")
        services.sessions.reload()
    }

    private func writeSession(id: String, cwd: String, event: String, extra: String = "") {
        let text = #"{"pid":\#(pid),"event":{"session_id":"\#(id)","cwd":"\#(cwd)","hook_event_name":"\#(event)"\#(extra)}}"#
        let target = "\(paths.sessionsDir)/\(id).json"
        try? text.write(toFile: target + ".tmp", atomically: false, encoding: .utf8)
        _ = try? FileManager.default.replaceItemAt(URL(fileURLWithPath: target), withItemAt: URL(fileURLWithPath: target + ".tmp"))
        if !FileManager.default.fileExists(atPath: target) { try? FileManager.default.moveItem(atPath: target + ".tmp", toPath: target) }
    }

    func start() {
        let steps: [(Double, String, () -> Void)] = [
            (1.5, "notificação do Claude", { [self] in services.notifications.push(app: "Claude Code", title: "docs-site", body: "Esperando você") }),
            (7, "Claude trabalhando", { [self] in writeSession(id: "loja", cwd: "/Users/demo/loja-api", event: "PreToolUse", extra: #","tool_name":"Edit","tool_input":{"file_path":"/Users/demo/loja-api/src/cart.ts"}"#) }),
            (14, "pedido de permissão (clique em Aprovar ou Negar)", { [self] in
                writeSession(id: "loja", cwd: "/Users/demo/loja-api", event: "PermissionRequest", extra: #","tool_name":"Bash","tool_input":{"command":"rm -rf node_modules && npm ci"}"#)
                let since = Int(Date().timeIntervalSince1970 * 1000)
                try? #"{"pid":\#(pid),"tool":"Bash","since":\#(since)}"#.write(toFile: "\(paths.pendingDir)/loja.r1.json", atomically: true, encoding: .utf8)
                services.sessions.reload()
            }),
            (26, "volume", { [self] in services.volume.changed.emit(60) }),
            (30, "música", { [self] in services.media.simulate(MediaTrack(title: "Blue in Green", artist: "Miles Davis", album: "Kind of Blue", app: "Spotify", playing: true, canPrevious: true, canNext: true)) }),
            (38, "reunião em breve", { [self] in
                services.calendar.installDemo(events: services.calendar.events(on: Date()), meeting: Meeting(title: "Daily do time", startsAt: Date().addingTimeInterval(5 * 60)), url: URL(string: "https://meet.google.com/abc-defg-hij"))
            }),
        ]
        print("frodo demo: roteiro de teste, passe o mouse na pílula para abrir a ilha")
        for (delay, title, action) in steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                print("frodo demo [\(Int(delay)) s]: \(title)")
                fflush(stdout)
                action()
            }
        }
        Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [self] _ in
            MainActor.assumeIsolated {
                let file = "\(paths.decisionsDir)/loja.r1.json"
                guard let text = try? String(contentsOfFile: file, encoding: .utf8) else { return }
                print("frodo demo: o hook receberia \(text.trimmingCharacters(in: .whitespacesAndNewlines))")
                fflush(stdout)
                try? FileManager.default.removeItem(atPath: file)
                try? FileManager.default.removeItem(atPath: "\(paths.pendingDir)/loja.r1.json")
                writeSession(id: "loja", cwd: "/Users/demo/loja-api", event: "PostToolUse", extra: #","tool_name":"Bash","tool_input":{"command":"npm ci"}"#)
                services.sessions.reload()
            }
        }
    }

    private static func writeTranscripts(configDir: String) {
        let directory = "\(configDir)/projects/-Users-demo-loja-api"
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        let now = Date()
        let calendar = Calendar.current
        var lines: [String] = []
        let projects = [("loja-api", "claude-opus-5-5"), ("docs-site", "claude-sonnet-5-5"), ("portal", "claude-haiku-5-5"), ("dynamic-island", "claude-opus-5-5")]
        for dayBack in 0 ..< 12 {
            guard let day = calendar.date(byAdding: .day, value: -dayBack, to: calendar.startOfDay(for: now)) else { continue }
            for (offset, hour) in [9, 10, 11, 14, 15, 16].enumerated() {
                let stamp = day.addingTimeInterval(TimeInterval(hour * 3600 + 300))
                if stamp > now { continue }
                let project = projects[(dayBack + offset) % projects.count]
                let tokens = 40_000 + (dayBack * 7 + offset * 13) % 90 * 1000
                let record: JSONValue = .object([
                    "type": .string("assistant"), "timestamp": .string(iso(stamp)), "sessionId": .string("demo-\(dayBack)-\(offset % 3)"),
                    "cwd": .string("/Users/demo/\(project.0)"), "gitBranch": .string("main"), "isSidechain": .bool(false),
                    "message": .object([
                        "id": .string("m-\(dayBack)-\(offset)"), "model": .string(project.1), "content": .array([]),
                        "usage": .object([
                            "input_tokens": .number(Double(tokens)), "output_tokens": .number(Double(tokens / 6)),
                            "cache_read_input_tokens": .number(Double(tokens * 3)), "cache_creation_input_tokens": .number(Double(tokens / 10)),
                        ]),
                    ]),
                ])
                if let data = try? JSONEncoder().encode(record) { lines.append(String(decoding: data, as: UTF8.self)) }
            }
        }
        try? (lines.joined(separator: "\n") + "\n").write(toFile: "\(directory)/demo.jsonl", atomically: true, encoding: .utf8)
    }
}
