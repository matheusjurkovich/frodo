import Foundation
import Testing

@testable import FrodoCore

@Suite("atalho")
struct ShortcutTests {
    @Test("lê modificadores e tecla em qualquer ordem")
    func readsModifiersAndKeyInAnyOrder() {
        #expect(parseShortcut("ctrl+opt+z") == Shortcut(key: "z", modifiers: [.control, .option]))
        #expect(parseShortcut("Opt+Ctrl+Shift+Z") == Shortcut(key: "z", modifiers: [.control, .option, .shift]))
        #expect(parseShortcut("cmd+1")?.display == "⌘1")
    }

    @Test("exige ao menos um modificador e uma tecla")
    func requiresAtLeastOneModifierAndAKey() {
        #expect(parseShortcut("z") == nil)
        #expect(parseShortcut("ctrl+") == nil)
        #expect(parseShortcut("ctrl+opt+zz") == nil)
        #expect(parseShortcut("ctrl+ctrl+z") == nil)
        #expect(parseShortcut("super+z") == nil)
    }

    @Test("mostra com símbolos e volta a texto")
    func displaysWithSymbolsAndRoundTripsToText() {
        let shortcut = parseShortcut("ctrl+opt+shift+z")
        #expect(shortcut?.display == "⌃⌥⇧Z")
        #expect(shortcut?.text == "ctrl+opt+shift+z")
    }
}

@Suite("link de reunião")
struct MeetingLinkTests {
    @Test("acha Meet, Zoom e Teams no local, nas notas ou na URL")
    func findsMeetZoomAndTeams() {
        #expect(meetingLink(in: ["Sala 2", "Entre em https://meet.google.com/abc-defg-hij agora"])?.absoluteString == "https://meet.google.com/abc-defg-hij")
        #expect(meetingLink(in: ["https://acme.zoom.us/j/123456789?pwd=x"])?.host() == "acme.zoom.us")
        #expect(meetingLink(in: ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=x"])?.host() == "teams.microsoft.com")
    }

    @Test("sem link devolve nil")
    func withoutLinkReturnsNil() {
        #expect(meetingLink(in: ["Sala 2", "", "https://example.com/x"]) == nil)
        #expect(meetingLink(in: []) == nil)
    }
}

@Suite("bloco de hooks")
struct HookSettingsTests {
    @Test("gera JSON válido com um comando por evento")
    func generatesValidJSONWithOneCommandPerEvent() {
        let text = hookSettingsJSON(scriptPath: "/Users/u/Library/Application Support/Frodo/hooks/claude-session.sh")
        let json = JSONValue(text: text)
        #expect(json?.field("hooks")?.object?.keys.sorted() == claudeHookEvents.sorted())
        #expect(json?.field("hooks", "Stop")?.array?.first?.field("hooks")?.array?.first?.field("command")?.string == "'/Users/u/Library/Application Support/Frodo/hooks/claude-session.sh'")
    }

    @Test("o comando entre aspas sobrevive a espaço e a aspa simples no caminho")
    func quotedCommandSurvivesSpacesAndSingleQuotes() {
        #expect(shellQuoted("/a b/c.sh") == "'/a b/c.sh'")
        #expect(shellQuoted("/o'brien/c.sh") == "'/o'\\''brien/c.sh'")
        let json = JSONValue(text: hookSettingsJSON(scriptPath: "/o'brien/c.sh"))
        #expect(json?.field("hooks", "Stop")?.array?.first?.field("hooks")?.array?.first?.field("command")?.string == "'/o'\\''brien/c.sh'")
    }
}

@MainActor
@Suite("NotificationsStore")
struct NotificationsStoreTests {
    @Test("guarda a mais nova primeiro e avisa quem ouve")
    func keepsNewestFirstAndNotifiesListeners() {
        let store = NotificationsStore()
        var intercepted: [String] = []
        _ = store.intercepted.on { intercepted.append($0.title) }
        store.push(app: "Claude Code", title: "a", body: "x")
        store.push(app: "Claude Code", title: "b", body: "y")
        #expect(store.items.map(\.title) == ["b", "a"])
        #expect(intercepted == ["a", "b"])
        #expect(store.count == 2)
    }

    @Test("não perturbe guarda na lista mas não avisa a pílula")
    func doNotDisturbKeepsInListButSkipsPill() {
        let store = NotificationsStore()
        var intercepted = 0
        _ = store.intercepted.on { _ in intercepted += 1 }
        store.doNotDisturb = true
        store.push(app: "Claude Code", title: "a", body: "x")
        #expect(store.count == 1)
        #expect(intercepted == 0)
    }

    @Test("dispensa uma e limpa tudo")
    func dismissesOneAndClearsAll() {
        let store = NotificationsStore()
        store.push(app: "Claude Code", title: "a", body: "x")
        store.push(app: "Claude Code", title: "b", body: "y")
        if let id = store.items.last?.id { store.dismiss(id) }
        #expect(store.items.map(\.title) == ["b"])
        store.clearAll()
        #expect(store.items.isEmpty)
    }

    @Test("traduz notificações do Claude Code")
    func translatesClaudeCodeNotifications() {
        func event(_ type: String?) -> HookEvent {
            HookEvent(sessionId: "s", cwd: "/home/u/loja-api/", name: "Notification", tool: nil, input: [:], notificationType: type, pid: nil)
        }
        #expect(claudeNotification(for: event("permission_prompt"))?.title == "loja-api")
        #expect(claudeNotification(for: event("permission_prompt"))?.body == "Precisa de permissão")
        #expect(claudeNotification(for: event("idle_prompt"))?.body == "Esperando você")
        #expect(claudeNotification(for: event("auth_success")) == nil)
        let other = HookEvent(sessionId: "s", cwd: "/x", name: "Stop", tool: nil, input: [:], notificationType: nil, pid: nil)
        #expect(claudeNotification(for: other) == nil)
    }
}
