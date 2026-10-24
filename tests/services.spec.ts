import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ClaudeClient} from '../src/services/claude-client.js';
import {readMemory} from '../src/services/memory.js';
import {FrodoSettings, SCHEMA_ID} from '../src/services/settings.js';

describe('readMemory', () => {
    it('lê /proc/meminfo', async () => {
        const memory = await readMemory();
        expect(memory).not.toBeNull();
        expect(memory?.usedKb).toBeGreaterThan(0);
        expect(memory?.usedKb).toBeLessThan(memory?.totalKb ?? 0);
    });
});

describe('ClaudeClient', () => {
    it('reporta falta de credenciais sem rede', async () => {
        const dir = GLib.dir_make_tmp('frodo-XXXXXX');
        GLib.setenv('CLAUDE_CONFIG_DIR', dir, true);
        const client = new ClaudeClient();
        try {
            expect(await client.fetch()).toEqual({session: null, weekly: null, error: 'no-credentials'});
        } finally {
            client.destroy();
            GLib.unsetenv('CLAUDE_CONFIG_DIR');
            GLib.rmdir(dir);
        }
    });
});

describe('FrodoSettings', () => {
    function create(): FrodoSettings {
        const source = Gio.SettingsSchemaSource.new_from_directory('.build', Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(SCHEMA_ID, false);
        if (!schema) throw new Error('schema não compilado em .build');
        return new FrodoSettings(new Gio.Settings({settings_schema: schema, backend: Gio.memory_settings_backend_new()}));
    }

    it('expõe os padrões tipados', () => {
        const settings = create();
        expect(settings.closedMode).toBe('compact');
        expect(settings.closedItems).toEqual(['clock', 'system', 'ram', 'claude-session']);
        expect(settings.monitors).toBe('primary');
        expect(settings.hideTopBar).toBeFalse();
        expect(settings.toggleShortcut).toBe('<Super>z');
    });

    it('ignora itens desconhecidos e repetidos e preserva a ordem escolhida', () => {
        const settings = create();
        settings.gsettings.set_strv('closed-items', ['claude-weekly', 'xyz', 'battery', 'battery']);
        expect(settings.closedItems).toEqual(['claude-weekly', 'battery']);
        settings.closedItems = ['ram', 'clock', 'ram'];
        expect(settings.gsettings.get_strv('closed-items')).toEqual(['ram', 'clock']);
    });

    it('avisa mudanças e permite parar de ouvir', () => {
        const settings = create();
        const spy = jasmine.createSpy('changed');
        const off = settings.onChanged(['closed-mode', 'monitors'], spy);
        settings.closedMode = 'minimal';
        off();
        settings.monitors = 'both';
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
