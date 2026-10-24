import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {itemsForPreferences, moveItem} from './core/items.js';
import type {ItemEntry} from './core/items.js';
import {isValidShortcut} from './core/shortcut.js';
import type {ClosedItem, ClosedMode, MonitorMode} from './core/types.js';
import {FrodoSettings} from './services/settings.js';
import type {SettingsKey} from './services/settings.js';

type Option<T extends string> = readonly [value: T, label: string];

const MODES: readonly Option<ClosedMode>[] = [
    ['minimal', 'Minimalista'],
    ['compact', 'Compacto'],
    ['rotating', 'Rotativo'],
];

const MONITORS: readonly Option<MonitorMode>[] = [
    ['primary', 'Somente monitor principal'],
    ['secondary', 'Somente monitor secundário'],
    ['both', 'Ambos'],
];

const ITEM_LABELS: Record<ClosedItem, {title: string; subtitle: string}> = {
    clock: {title: 'Relógio', subtitle: 'Hora atual'},
    system: {title: 'Ícones do sistema', subtitle: 'Rede, som, Bluetooth, bateria e VPN, iguais aos do painel'},
    battery: {title: 'Bateria', subtitle: 'Ícone e porcentagem'},
    ram: {title: 'RAM', subtitle: 'Memória em uso'},
    'claude-session': {title: 'Claude sessão', subtitle: 'Uso da janela de 5 horas'},
    'claude-weekly': {title: 'Claude semana', subtitle: 'Uso da janela de 7 dias'},
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

function group(title: string, rows: readonly Gtk.Widget[], description = ''): Adw.PreferencesGroup {
    const preferencesGroup = new Adw.PreferencesGroup({title, description});
    for (const row of rows) preferencesGroup.add(row);
    return preferencesGroup;
}

class ItemOrderGroup {
    readonly widget = new Adw.PreferencesGroup({
        title: 'Itens da ilha fechada',
        description: 'Arraste pela alça para mudar a ordem. A ordem vale para os modos Compacto e Rotativo.',
    });
    readonly #settings: FrodoSettings;
    #rows: Adw.ActionRow[] = [];

    constructor(settings: FrodoSettings) {
        this.#settings = settings;
        settings.onChanged('closed-items', () => {
            this.#render();
        });
        this.#render();
    }

    #render(): void {
        for (const row of this.#rows) this.widget.remove(row);
        const entries = itemsForPreferences(this.#settings.closedItems);
        this.#rows = entries.map((entry, index) => this.#row(entries, entry, index));
        for (const row of this.#rows) this.widget.add(row);
    }

    #row(entries: readonly ItemEntry[], entry: ItemEntry, index: number): Adw.ActionRow {
        const {title, subtitle} = ITEM_LABELS[entry.item];
        const row = new Adw.ActionRow({title, subtitle});
        row.add_prefix(new Gtk.Image({icon_name: 'list-drag-handle-symbolic', css_classes: ['dim-label']}));

        const toggle = new Gtk.Switch({active: entry.enabled, valign: Gtk.Align.CENTER});
        toggle.connect('notify::active', () => {
            if (toggle.active === entry.enabled) return;
            this.#settings.closedItems = entries
                .map(current => (current.item === entry.item ? {...current, enabled: toggle.active} : current))
                .filter(current => current.enabled)
                .map(current => current.item);
        });
        row.add_suffix(toggle);
        row.activatable_widget = toggle;

        const source = new Gtk.DragSource({actions: Gdk.DragAction.MOVE});
        source.connect('prepare', () => Gdk.ContentProvider.new_for_value(String(index)));
        source.connect('drag-begin', (_source, drag) => {
            const icon = Gtk.DragIcon.get_for_drag(drag);
            icon.child = new Gtk.Label({label: title, css_classes: ['heading']});
        });
        row.add_controller(source);

        const target = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE);
        target.connect('drop', (_target, value) => {
            const from = Number(value);
            if (!Number.isInteger(from) || from === index) return false;
            this.#settings.closedItems = moveItem(entries, from, index);
            return true;
        });
        row.add_controller(target);
        return row;
    }
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
                spinRow(settings, 'rotate-seconds', 'Trocar a cada (s)', 2, 30),
            ]),
        );
        page.add(new ItemOrderGroup(settings).widget);
        page.add(group('Tela', [comboRow(settings, 'monitors', 'Monitores', MONITORS), hideTopBar]));
        page.add(group('Claude', [spinRow(settings, 'claude-poll-minutes', 'Atualizar a cada (min)', 2, 60)]));
        page.add(group('Atalho', [shortcutRow(settings)]));
        return page;
    }
}
