import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {itemsForPreferences, moveItem} from './core/items.js';
import type {ItemEntry} from './core/items.js';
import {isActiveProfile} from './core/claude-profiles.js';
import type {ClaudeProfile} from './core/claude-profiles.js';
import {isValidShortcut} from './core/shortcut.js';
import {defaultConfigDir} from './services/claude-client.js';
import {profileFor} from './services/claude-profiles.js';
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
    date: {title: 'Data', subtitle: 'Dia da semana, dia e mês'},
    notifications: {title: 'Notificações', subtitle: 'Sino com a contagem, só quando há notificações'},
    network: {title: 'Rede', subtitle: 'Ícone de rede do painel'},
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

function shortcutRow(settings: FrodoSettings, key: 'toggle-shortcut' | 'claude-shortcut', title: string): Adw.EntryRow {
    const row = new Adw.EntryRow({title, show_apply_button: true});
    const current = (): string => settings.gsettings.get_strv(key)[0] ?? '';
    row.text = current();
    row.connect('apply', () => {
        const [ok, keyval, mods] = Gtk.accelerator_parse(row.text);
        if (isValidShortcut(ok, keyval, mods ?? 0)) settings.gsettings.set_strv(key, [row.text]);
        else row.text = current();
    });
    return row;
}

function switchRow(settings: FrodoSettings, key: SettingsKey, title: string, subtitle = ''): Adw.SwitchRow {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.gsettings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

class ProfilesGroup {
    readonly widget = new Adw.PreferencesGroup({
        title: 'Perfis do Claude Code',
        description: 'Cada perfil é um diretório de configuração do Claude Code. O Frodo usa o login que já está salvo nele.',
    });
    readonly #settings: FrodoSettings;
    #rows: Gtk.Widget[] = [];

    constructor(settings: FrodoSettings) {
        this.#settings = settings;
        const add = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: 'Adicionar perfil',
        });
        add.connect('clicked', () => {
            this.#pickDirectory();
        });
        this.widget.header_suffix = add;
        settings.onChanged('claude-profiles', () => {
            this.#render();
        });
        this.#render();
    }

    #render(): void {
        for (const row of this.#rows) this.widget.remove(row);
        const profiles = this.#settings.claudeProfiles;
        const defaultDir = defaultConfigDir();
        this.#rows = profiles.map(profile => this.#row(profile, isActiveProfile(profile, defaultDir)));
        if (this.#rows.length === 0)
            this.#rows = [new Adw.ActionRow({title: 'Nenhum perfil', subtitle: 'Abra a ilha uma vez para detectar os perfis'})];
        for (const row of this.#rows) this.widget.add(row);
    }

    #row(profile: ClaudeProfile, active: boolean): Adw.EntryRow {
        const row = new Adw.EntryRow({title: profile.configDir, text: profile.label, show_apply_button: true});
        if (active) row.add_suffix(new Gtk.Label({label: 'ativo', css_classes: ['caption', 'accent'], valign: Gtk.Align.CENTER}));
        const remove = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: 'Remover perfil',
        });
        remove.connect('clicked', () => {
            this.#settings.claudeProfiles = this.#settings.claudeProfiles.filter(other => other.id !== profile.id);
        });
        row.add_suffix(remove);
        row.connect('apply', () => {
            const label = row.text.trim();
            if (!label) return;
            this.#settings.claudeProfiles = this.#settings.claudeProfiles.map(other =>
                other.id === profile.id ? {...other, label} : other,
            );
        });
        return row;
    }

    #pickDirectory(): void {
        const dialog = new Gtk.FileDialog({title: 'Diretório do Claude Code', initial_folder: Gio.File.new_for_path(GLib.get_home_dir())});
        const root = this.widget.get_root();
        dialog.select_folder(root instanceof Gtk.Window ? root : null, null, (_dialog, result) => {
            const folder = ((): Gio.File | null => {
                try {
                    return dialog.select_folder_finish(result);
                } catch {
                    return null;
                }
            })();
            const path = folder?.get_path();
            if (!path || this.#settings.claudeProfiles.some(profile => profile.configDir === path)) return;
            this.#settings.claudeProfiles = [...this.#settings.claudeProfiles, profileFor(path)];
        });
    }
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
        page.add(
            group('Claude', [
                spinRow(settings, 'claude-poll-minutes', 'Atualizar a cada (min)', 1, 60),
                switchRow(settings, 'claude-show-remaining', 'Mostrar uso restante', 'Em vez da porcentagem usada'),
            ]),
        );
        page.add(new ProfilesGroup(settings).widget);
        page.add(
            group('Atalhos', [
                shortcutRow(settings, 'toggle-shortcut', 'Abrir e fechar a ilha'),
                shortcutRow(settings, 'claude-shortcut', 'Abrir a ilha na aba do Claude'),
            ]),
        );
        return page;
    }
}
