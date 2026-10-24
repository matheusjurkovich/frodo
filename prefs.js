import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {isValidShortcut} from './lib/format.js';

const MODES = [['minimal', 'Minimalista'], ['compact', 'Compacto'], ['rotating', 'Rotativo']];
const LAYOUTS = [['single', 'Painel único'], ['tabs', 'Abas']];
const ITEMS = [['battery', 'Bateria'], ['ram', 'RAM'], ['claude-session', 'Claude sessão'], ['claude-weekly', 'Claude semana']];

function comboRow(settings, key, title, options) {
    const row = new Adw.ComboRow({title, model: Gtk.StringList.new(options.map(([, label]) => label))});
    const sync = () => {
        row.selected = Math.max(0, options.findIndex(([v]) => v === settings.get_string(key)));
    };
    sync();
    settings.connect(`changed::${key}`, sync);
    row.connect('notify::selected', () => settings.set_string(key, options[row.selected][0]));
    return row;
}

function spinRow(settings, key, title, min, max) {
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = title;
    settings.bind(key, row, 'value', 0);
    return row;
}

export default class FrodoPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        const closed = new Adw.PreferencesGroup({title: 'Ilha fechada'});
        closed.add(comboRow(settings, 'closed-mode', 'Modo', MODES));
        for (const [item, label] of ITEMS) {
            const row = new Adw.SwitchRow({title: label});
            const sync = () => {
                row.active = settings.get_strv('closed-items').includes(item);
            };
            sync();
            settings.connect('changed::closed-items', sync);
            row.connect('notify::active', () => {
                const current = settings.get_strv('closed-items');
                if (row.active === current.includes(item))
                    return;
                const next = ITEMS.map(([v]) => v)
                    .filter(v => v === item ? row.active : current.includes(v));
                settings.set_strv('closed-items', next);
            });
            closed.add(row);
        }
        closed.add(spinRow(settings, 'rotate-seconds', 'Trocar a cada (s)', 2, 30));
        page.add(closed);

        const open = new Adw.PreferencesGroup({title: 'Ilha aberta'});
        open.add(comboRow(settings, 'open-layout', 'Layout', LAYOUTS));
        page.add(open);

        const bar = new Adw.PreferencesGroup({title: 'Barra superior'});
        const hide = new Adw.SwitchRow({title: 'Ocultar barra superior'});
        settings.bind('hide-top-bar', hide, 'active', 0);
        bar.add(hide);
        page.add(bar);

        const claude = new Adw.PreferencesGroup({title: 'Claude'});
        claude.add(spinRow(settings, 'claude-poll-minutes', 'Atualizar a cada (min)', 2, 60));
        page.add(claude);

        const shortcut = new Adw.PreferencesGroup({title: 'Atalho'});
        const entry = new Adw.EntryRow({title: 'Abrir e fechar a ilha', show_apply_button: true});
        entry.text = settings.get_strv('toggle-shortcut')[0] ?? '';
        entry.connect('apply', () => {
            const [ok, key, mods] = Gtk.accelerator_parse(entry.text);
            if (isValidShortcut(ok, key, mods))
                settings.set_strv('toggle-shortcut', [entry.text]);
            else
                entry.text = settings.get_strv('toggle-shortcut')[0] ?? '';
        });
        shortcut.add(entry);
        page.add(shortcut);

        window.add(page);
    }
}
