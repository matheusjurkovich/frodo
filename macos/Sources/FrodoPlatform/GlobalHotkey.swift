import Carbon.HIToolbox
import FrodoCore

private let keyCodes: [String: UInt32] = [
    "a": 0x00, "s": 0x01, "d": 0x02, "f": 0x03, "h": 0x04, "g": 0x05, "z": 0x06, "x": 0x07, "c": 0x08, "v": 0x09, "b": 0x0B, "q": 0x0C,
    "w": 0x0D, "e": 0x0E, "r": 0x0F, "y": 0x10, "t": 0x11, "1": 0x12, "2": 0x13, "3": 0x14, "4": 0x15, "6": 0x16, "5": 0x17, "9": 0x19,
    "7": 0x1A, "8": 0x1C, "0": 0x1D, "o": 0x1F, "u": 0x20, "i": 0x22, "p": 0x23, "l": 0x25, "j": 0x26, "k": 0x28, "n": 0x2D, "m": 0x2E,
]

public func carbonKeyCode(_ key: String) -> UInt32? {
    keyCodes[key.lowercased()]
}

public func carbonModifiers(_ modifiers: [ShortcutModifier]) -> UInt32 {
    modifiers.reduce(0) { result, modifier in
        switch modifier {
        case .control: result | UInt32(controlKey)
        case .option: result | UInt32(optionKey)
        case .shift: result | UInt32(shiftKey)
        case .command: result | UInt32(cmdKey)
        }
    }
}

@MainActor
public final class GlobalHotkeys: Destroyable {
    private var handlers: [UInt32: () -> Void] = [:]
    private var references: [EventHotKeyRef] = []
    private var eventHandler: EventHandlerRef?
    private var nextId: UInt32 = 1

    public init() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, context in
                guard let event, let context else { return noErr }
                var hotKey = EventHotKeyID()
                GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKey)
                let owner = Unmanaged<GlobalHotkeys>.fromOpaque(context).takeUnretainedValue()
                MainActor.assumeIsolated { owner.handlers[hotKey.id]?() }
                return noErr
            },
            1, &eventType, context, &eventHandler
        )
    }

    @discardableResult
    public func register(_ shortcut: Shortcut, handler: @escaping () -> Void) -> Bool {
        guard let keyCode = carbonKeyCode(shortcut.key) else { return false }
        let id = nextId
        nextId += 1
        var reference: EventHotKeyRef?
        let hotKeyID = EventHotKeyID(signature: OSType(0x4652_444F), id: id)
        let status = RegisterEventHotKey(keyCode, carbonModifiers(shortcut.modifiers), hotKeyID, GetApplicationEventTarget(), 0, &reference)
        guard status == noErr, let reference else { return false }
        references.append(reference)
        handlers[id] = handler
        return true
    }

    public func unregisterAll() {
        for reference in references { UnregisterEventHotKey(reference) }
        references = []
        handlers = [:]
    }

    public func destroy() {
        unregisterAll()
        if let eventHandler { RemoveEventHandler(eventHandler) }
        eventHandler = nil
    }
}
