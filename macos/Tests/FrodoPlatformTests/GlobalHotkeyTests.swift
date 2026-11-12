import Carbon.HIToolbox
import Testing

@testable import FrodoCore
@testable import FrodoPlatform

@Suite("teclas do atalho global")
struct GlobalHotkeyTests {
    @Test("letras e números viram o código de tecla do Carbon, sem diferenciar maiúscula")
    func keysMapToCarbonKeyCodes() {
        #expect(carbonKeyCode("z") == UInt32(kVK_ANSI_Z))
        #expect(carbonKeyCode("Z") == UInt32(kVK_ANSI_Z))
        #expect(carbonKeyCode("a") == UInt32(kVK_ANSI_A))
        #expect(carbonKeyCode("1") == UInt32(kVK_ANSI_1))
        #expect(carbonKeyCode("0") == UInt32(kVK_ANSI_0))
    }

    @Test("todas as teclas do mapa fazem o caminho de ida e volta pelo código")
    func keyCodesRoundTrip() throws {
        for key in "abcdefghijklmnopqrstuvwxyz0123456789" {
            let code = try #require(carbonKeyCode(String(key)))
            #expect(shortcutKey(forKeyCode: UInt16(code)) == String(key))
        }
    }

    @Test("código fora do mapa não tem tecla")
    func unknownCodeHasNoKey() {
        #expect(shortcutKey(forKeyCode: UInt16(kVK_Return)) == nil)
    }

    @Test("tecla fora do mapa não tem código")
    func unknownKeyHasNoCode() {
        #expect(carbonKeyCode("é") == nil)
        #expect(carbonKeyCode("") == nil)
    }

    @Test("modificadores somam as máscaras do Carbon")
    func modifiersCombineCarbonMasks() {
        #expect(carbonModifiers([]) == 0)
        #expect(carbonModifiers([.control, .option]) == UInt32(controlKey) | UInt32(optionKey))
        #expect(carbonModifiers([.shift, .command]) == UInt32(shiftKey) | UInt32(cmdKey))
    }
}
