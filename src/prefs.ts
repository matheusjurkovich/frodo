import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {isValidShortcut} from './core/shortcut.js';
import {CLOSED_ITEMS} from './core/types.js';
import type {ClosedItem, ClosedMode, OpenLayout} from './core/types.js';
import {FrodoSettings} from './services/settings.js';
import type {SettingsKey} from './services/settings.js';

type Option<T extends string> = readonly [value: T, label: string];

const MODES: readonly Option<ClosedMode>[] = [
    ['minimal', 'Minimalista'],
    ['compact', 'Compacto'],
    ['rotating', 'Rotativo'],
];

const LAYOUTS: readonly Option<OpenLayout>[] = [
    ['single', 'Painel único'],
    ['tabs', 'Abas'],
];

const ITEM_LABELS: Record<ClosedItem, string> = {
    battery: 'Bateria',
    ram: 'RAM',
    'claude-session': 'Claude sessão',
    'claude-weekly': 'Claude semana',
};

function comboRow<T extends string>(settings: FrodoSettings, key: SettingsKey, title: string, options: readonly Option<T>[]): Adw.ComboRow {
    const row = new Adw.ComboRow({title, model: Gtk.StringList.new(options.map(([, label]) => label))});
    const sync = (): void => {
        row.selected = Math.max(
            0,
            options.findIndex(([value]) => value === settings.gsettings.get_string(key)),
        );
    };
    sync();
    settings.onChanged(key, sync);
    row.connect('notify::selected', () => {
        const option = options[row.selected];
        if (option) settings.gsettings.set_string(key, option[0]);
    });
    return row;
}

function spinRow(settings: FrodoSettings, key: SettingsKey, title: string, min: number, max: number): Adw.SpinRow {
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = title;
    settings.gsettings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function itemRow(settings: FrodoSettings, item: ClosedItem): Adw.SwitchRow {
    const row = new Adw.SwitchRow({title: ITEM_LABELS[item]});
    const sync = (): void => {
        row.active = settings.closedItems.includes(item);
    };
    sync();
    settings.onChanged('closed-items', sync);
    row.connect('notify::active', () => {
        const current = settings.closedItems;
        if (row.active === current.includes(item)) return;
        settings.closedItems = row.active ? [...current, item] : current.filter(other => other !== item);
    });
    return row;
}

function shortcutRow(settings: FrodoSettings): Adw.EntryRow {
    const row = new Adw.EntryRow({title: 'Abrir e fechar a ilha', show_apply_button: true});
    row.text = settings.toggleShortcut;
    row.connect('apply', () => {
        const [ok, key, mods] = Gtk.accelerator_parse(row.text);
        if (isValidShortcut(ok, key, mods ?? 0)) settings.toggleShortcut = row.text;
        else row.text = settings.toggleShortcut;
    });
    return row;
}

function group(title: string, rows: readonly Gtk.Widget[]): Adw.PreferencesGroup {
    const preferencesGroup = new Adw.PreferencesGroup({title});
    for (const row of rows) preferencesGroup.add(row);
    return preferencesGroup;
}

export default class FrodoPreferences extends ExtensionPreferences {
    override getPreferencesWidget(): Adw.PreferencesPage {
        const settings = new FrodoSettings(this.getSettings());
        const hideTopBar = new Adw.SwitchRow({title: 'Ocultar barra superior'});
        settings.gsettings.bind('hide-top-bar', hideTopBar, 'active', Gio.SettingsBindFlags.DEFAULT);

        const page = new Adw.PreferencesPage();
        page.add(
            group('Ilha fechada', [
                comboRow(settings, 'closed-mode', 'Modo', MODES),
                ...CLOSED_ITEMS.map(item => itemRow(settings, item)),
                spinRow(settings, 'rotate-seconds', 'Trocar a cada (s)', 2, 30),
            ]),
        );
        page.add(group('Ilha aberta', [comboRow(settings, 'open-layout', 'Layout', LAYOUTS)]));
        page.add(group('Barra superior', [hideTopBar]));
        page.add(group('Claude', [spinRow(settings, 'claude-poll-minutes', 'Atualizar a cada (min)', 2, 60)]));
        page.add(group('Atalho', [shortcutRow(settings)]));
        return page;
    }
}
