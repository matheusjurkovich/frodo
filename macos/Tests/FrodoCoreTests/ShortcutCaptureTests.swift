import Testing

@testable import FrodoCore

@Suite("captura de atalho")
struct ShortcutCaptureTests {
    @Test("monta o atalho na ordem que o parser lê")
    func ordem() {
        #expect(capturedShortcut(key: "z", control: true, option: true, shift: false, command: false) == "ctrl+opt+z")
        #expect(capturedShortcut(key: "Z", control: true, option: true, shift: true, command: false) == "ctrl+opt+shift+z")
        #expect(capturedShortcut(key: "1", control: false, option: false, shift: true, command: true) == "shift+cmd+1")
    }

    @Test("recusa tecla sem modificador ou sem nome")
    func semModificador() {
        #expect(capturedShortcut(key: "z", control: false, option: false, shift: false, command: false) == nil)
        #expect(capturedShortcut(key: "", control: false, option: false, shift: false, command: true) == nil)
        #expect(capturedShortcut(key: "!", control: true, option: false, shift: false, command: false) == nil)
        #expect(capturedShortcut(key: "ab", control: true, option: false, shift: false, command: false) == nil)
    }

    @Test("só Shift não basta")
    func soShift() {
        #expect(capturedShortcut(key: "a", control: false, option: false, shift: true, command: false) == nil)
    }

    @Test("o resultado é aceito pelo parser")
    func roundTrip() throws {
        let text = try #require(capturedShortcut(key: "k", control: true, option: true, shift: true, command: true))
        #expect(parseShortcut(text)?.text == text)
        #expect(parseShortcut(text)?.modifiers == [.control, .option, .shift, .command])
    }

    @Test("recusa a combinação que a outra ação já usa")
    func reivindica() {
        #expect(claimShortcut("cmd+x", current: "cmd+z", other: "cmd+x") == .conflict)
        #expect(claimShortcut("cmd+x", current: "cmd+z", other: "cmd+c") == .ok)
        #expect(claimShortcut("cmd+z", current: "cmd+z", other: "cmd+c") == .same)
    }
}
