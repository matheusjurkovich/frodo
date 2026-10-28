import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {CheckBox} from 'resource:///org/gnome/shell/ui/checkBox.js';

import {isActiveProfile} from '../../features/claude/claude-profiles.js';
import {profileFor} from '../../features/claude/claude-profiles-service.js';
import {expandHome} from '../../settings/claude-profile.js';
import type {ClaudeProfile} from '../../settings/claude-profile.js';
import {accelerator, shortcutLabel} from '../../settings/shortcut.js';
import {TAB_LABELS, visibleTabs} from '../../settings/tabs.js';
import {TAB_IDS} from '../../settings/schema-values.js';
import type {MonitorMode, SurfaceStyle, TabId} from '../../settings/schema-values.js';
import {defaultConfigDir} from '../../features/claude/claude-client.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {spawn} from '../../shared/shell-internals.js';
import {Disposables} from '../../shared/disposables.js';
import {backHeader, card, cardTitle} from '../../shared/ui/card.js';
import {chip, iconButton, textButton} from '../../shared/ui/buttons.js';
import {column, dimLabel, label, row, spacer} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {frodoIcon} from '../../shared/ui/icons.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const SHOW_SECONDS_KEY = 'clock-show-seconds';
const POLL_MINUTES = {min: 1, max: 60} as const;
const MODIFIER_KEYS: readonly number[] = [
    Clutter.KEY_Shift_L,
    Clutter.KEY_Shift_R,
    Clutter.KEY_Control_L,
    Clutter.KEY_Control_R,
    Clutter.KEY_Alt_L,
    Clutter.KEY_Alt_R,
    Clutter.KEY_Super_L,
    Clutter.KEY_Super_R,
    Clutter.KEY_Meta_L,
    Clutter.KEY_Meta_R,
    Clutter.KEY_ISO_Level3_Shift,
];

const MONITORS: readonly {id: MonitorMode; label: string}[] = [
    {id: 'primary', label: 'Principal'},
    {id: 'secondary', label: 'Secundário'},
    {id: 'both', label: 'Ambos'},
];

const SURFACES: readonly {id: SurfaceStyle; label: string}[] = [
    {id: 'solid', label: 'Sólido'},
    {id: 'frosted', label: 'Fosco'},
    {id: 'clear', label: 'Translúcido'},
];

type ShortcutKey = 'toggle-shortcut' | 'claude-shortcut';

interface Range {
    readonly min: number;
    readonly max: number;
}

export interface SettingsActions {
    readonly back: () => void;
    readonly close: () => void;
    readonly grabKeyboard: (focus: Clutter.Actor) => void;
}

function tile(child: Clutter.Actor, styleClass: string): St.Bin {
    child.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, x_expand: true, y_expand: true});
    return new St.Bin({style_class: `frodo-integration-icon ${styleClass}`, child, y_align: Clutter.ActorAlign.CENTER});
}

function integration(icon: St.Bin, title: string, subtitle: St.Widget, action?: St.Button): St.BoxLayout {
    const item = row('frodo-integration');
    const text = column('frodo-integration-text');
    text.y_align = Clutter.ActorAlign.CENTER;
    text.add_child(label(title, 'frodo-integration-title'));
    text.add_child(subtitle);
    item.add_child(icon);
    item.add_child(text);
    if (action) item.add_child(action);
    return item;
}

function settingsRow(text: string, ...controls: Clutter.Actor[]): St.BoxLayout {
    const line = row('frodo-settings-row');
    line.add_child(label(text, 'frodo-settings-text'));
    line.add_child(spacer());
    for (const control of controls) line.add_child(control);
    return line;
}

function stack(...cards: St.Widget[]): St.BoxLayout {
    const side = column('frodo-section');
    for (const child of cards) side.add_child(child);
    const last = cards.at(-1);
    if (last) last.y_expand = true;
    return side;
}

function columns(left: St.BoxLayout, right: St.BoxLayout): St.BoxLayout {
    const box = row('frodo-settings-columns');
    box.layout_manager.homogeneous = true;
    box.add_child(left);
    box.add_child(right);
    return box;
}

function homePath(path: string): string {
    const home = GLib.get_home_dir();
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export class SettingsPage implements Component {
    readonly actor = column('frodo-section');
    readonly #settings: FrodoSettings;
    readonly #interface = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    readonly #disposables = new Disposables();
    readonly #bindings: (() => void)[] = [];
    readonly #tabBoxes = new Map<TabId, CheckBox>();
    readonly #configDir = label('', 'frodo-integration-subtitle frodo-mono');
    readonly #profiles = column('frodo-settings-profiles');
    readonly #newProfile = new St.Entry({style_class: 'frodo-entry', hint_text: '~/.claude-trabalho', can_focus: true, x_expand: true});
    readonly #grabKeyboard: (focus: Clutter.Actor) => void;
    #capture: {readonly button: St.Button; readonly id: number} | null = null;

    constructor(settings: FrodoSettings, actions: SettingsActions) {
        this.#settings = settings;
        this.#grabKeyboard = actions.grabKeyboard;
        this.#typing(this.#newProfile);

        this.actor.add_child(backHeader('Configurações da ilha', actions.back));
        this.actor.add_child(
            columns(
                stack(this.#behavior(), this.#screen(), this.#claude()),
                stack(this.#tabs(), this.#shortcuts(), this.#integrations(actions)),
            ),
        );

        const sync = (): void => {
            this.#sync();
        };
        this.#disposables.add(
            settings.onChanged(
                [
                    'open-on-hover',
                    'auto-close',
                    'hidden-tabs',
                    'monitors',
                    'hide-top-bar',
                    'surface-style',
                    'claude-poll-minutes',
                    'claude-show-remaining',
                    'toggle-shortcut',
                    'claude-shortcut',
                ],
                sync,
            ),
        );
        this.#disposables.add(
            settings.onChanged('claude-profiles', () => {
                this.#renderProfiles();
            }),
        );
        this.#disposables.signal(this.#interface, this.#interface.connect(`changed::${SHOW_SECONDS_KEY}`, sync));
        this.#disposables.add(() => {
            this.#stopCapture();
        });
        this.#renderProfiles();
        this.#sync();
    }

    #typing(entry: St.Entry): void {
        entry.clutter_text.connect('key-focus-in', () => {
            this.#grabKeyboard(entry.clutter_text);
        });
    }

    #check(text: string, read: () => boolean, write: (checked: boolean) => void): CheckBox {
        const box = new CheckBox(text);
        box.add_style_class_name('frodo-check');
        box.connect('notify::checked', () => {
            if (box.checked !== read()) write(box.checked);
        });
        this.#bindings.push(() => {
            box.checked = read();
        });
        return box;
    }

    #segmented<T extends string>(options: readonly {id: T; label: string}[], read: () => T, write: (value: T) => void): St.BoxLayout {
        const segmented = this.#disposables.own(new Segmented(options, read(), ''));
        segmented.on('changed', write);
        this.#bindings.push(() => {
            segmented.selected = read();
        });
        return segmented.actor;
    }

    #stepper(range: Range, unit: string, read: () => number, write: (value: number) => void): St.BoxLayout {
        const value = label('', 'frodo-stepper-value frodo-mono');
        const step = (delta: number) => (): void => {
            const next = Math.min(range.max, Math.max(range.min, read() + delta));
            if (next !== read()) write(next);
        };
        const minus = iconButton(frodoIcon('minus'), 'Diminuir', step(-1), 'control', 32);
        const plus = iconButton(frodoIcon('plus'), 'Aumentar', step(1), 'control', 32);
        const stepper = new St.BoxLayout({style_class: 'frodo-stepper', y_align: Clutter.ActorAlign.CENTER});
        stepper.add_child(minus);
        stepper.add_child(value);
        stepper.add_child(plus);
        this.#bindings.push(() => {
            const current = read();
            value.text = `${current} ${unit}`;
            minus.reactive = current > range.min;
            plus.reactive = current < range.max;
        });
        return stepper;
    }

    #behavior(): St.BoxLayout {
        const settings = this.#settings;
        const behavior = card('frodo-settings-card');
        behavior.add_child(cardTitle('Comportamento'));
        behavior.add_child(
            this.#check(
                'Expandir ao passar o mouse',
                () => settings.openOnHover,
                checked => {
                    settings.openOnHover = checked;
                },
            ),
        );
        behavior.add_child(
            this.#check(
                'Recolher sozinha após 5 s sem uso',
                () => settings.autoClose,
                checked => {
                    settings.autoClose = checked;
                },
            ),
        );
        behavior.add_child(
            this.#check(
                'Mostrar segundos no relógio',
                () => this.#interface.get_boolean(SHOW_SECONDS_KEY),
                checked => {
                    this.#interface.set_boolean(SHOW_SECONDS_KEY, checked);
                },
            ),
        );
        return behavior;
    }

    #tabs(): St.BoxLayout {
        const settings = this.#settings;
        const tabs = card('frodo-settings-card');
        tabs.add_child(cardTitle('Abas visíveis'));
        for (const id of TAB_IDS) {
            const box = this.#check(
                TAB_LABELS[id],
                () => visibleTabs(settings.hiddenTabs).includes(id),
                checked => {
                    const visible = visibleTabs(settings.hiddenTabs).filter(tab => tab !== id);
                    if (checked) visible.push(id);
                    settings.hiddenTabs = TAB_IDS.filter(tab => !visible.includes(tab));
                },
            );
            this.#tabBoxes.set(id, box);
            tabs.add_child(box);
        }
        return tabs;
    }

    #screen(): St.BoxLayout {
        const settings = this.#settings;
        const screen = card('frodo-settings-card');
        screen.add_child(cardTitle('Tela'));
        screen.add_child(
            settingsRow(
                'Monitores',
                this.#segmented(
                    MONITORS,
                    () => settings.monitors,
                    mode => {
                        settings.monitors = mode;
                    },
                ),
            ),
        );
        screen.add_child(
            settingsRow(
                'Fundo',
                this.#segmented(
                    SURFACES,
                    () => settings.surfaceStyle,
                    style => {
                        settings.surfaceStyle = style;
                    },
                ),
            ),
        );
        screen.add_child(
            this.#check(
                'Ocultar barra superior',
                () => settings.hideTopBar,
                checked => {
                    settings.hideTopBar = checked;
                },
            ),
        );
        return screen;
    }

    #claude(): St.BoxLayout {
        const settings = this.#settings;
        const claude = card('frodo-settings-card');
        claude.add_child(cardTitle('Claude'));
        claude.add_child(
            settingsRow(
                'Atualizar uso a cada',
                this.#stepper(
                    POLL_MINUTES,
                    'min',
                    () => settings.claudePollMinutes,
                    value => {
                        settings.claudePollMinutes = value;
                    },
                ),
            ),
        );
        claude.add_child(
            this.#check(
                'Mostrar uso restante em vez do usado',
                () => settings.claudeShowRemaining,
                checked => {
                    settings.claudeShowRemaining = checked;
                },
            ),
        );
        claude.add_child(label('Perfis do Claude Code', 'frodo-settings-text'));
        claude.add_child(this.#profiles);

        const add = (): void => {
            this.#addProfile();
        };
        this.#newProfile.clutter_text.connect('activate', add);
        const adder = row('frodo-settings-row');
        adder.add_child(this.#newProfile);
        adder.add_child(textButton('Adicionar', add, 'control', frodoIcon('plus')));
        claude.add_child(adder);
        return claude;
    }

    #renderProfiles(): void {
        this.#profiles.destroy_all_children();
        const profiles = this.#settings.claudeProfiles;
        const defaultDir = defaultConfigDir();
        for (const profile of profiles) this.#profiles.add_child(this.#profileRow(profile, isActiveProfile(profile, defaultDir)));
        if (profiles.length === 0) this.#profiles.add_child(dimLabel('Abra a aba Claude uma vez para detectar os perfis'));
        const active = profiles.find(profile => isActiveProfile(profile, defaultDir)) ?? profiles[0];
        this.#configDir.text = homePath(active?.configDir ?? defaultDir);
    }

    #profileRow(profile: ClaudeProfile, active: boolean): St.BoxLayout {
        const name = new St.Entry({style_class: 'frodo-entry frodo-entry-name', hint_text: profile.label, can_focus: true, x_expand: true});
        this.#typing(name);
        name.clutter_text.connect('activate', () => {
            const text = name.text.trim();
            if (text === '' || text === profile.label) return;
            this.#settings.claudeProfiles = this.#settings.claudeProfiles.map(other =>
                other.id === profile.id ? {...other, label: text} : other,
            );
        });
        const text = column('frodo-settings-profile');
        text.add_child(name);
        text.add_child(label(homePath(profile.configDir), 'frodo-integration-subtitle frodo-mono'));
        const line = row('frodo-settings-row');
        line.add_child(text);
        if (active) line.add_child(chip('ativo', 'accent'));
        line.add_child(
            iconButton(
                frodoIcon('close'),
                'Remover perfil',
                () => {
                    this.#settings.claudeProfiles = this.#settings.claudeProfiles.filter(other => other.id !== profile.id);
                },
                'ghost',
                32,
            ),
        );
        return line;
    }

    #addProfile(): void {
        const path = expandHome(this.#newProfile.text, GLib.get_home_dir());
        const profiles = this.#settings.claudeProfiles;
        if (path === '' || !GLib.file_test(path, GLib.FileTest.IS_DIR) || profiles.some(profile => profile.configDir === path)) {
            this.#newProfile.add_style_pseudo_class('error');
            return;
        }
        this.#newProfile.remove_style_pseudo_class('error');
        this.#newProfile.text = '';
        this.#settings.claudeProfiles = [...profiles, profileFor(path)];
    }

    #shortcuts(): St.BoxLayout {
        const shortcuts = card('frodo-settings-card');
        shortcuts.add_child(cardTitle('Atalhos'));
        shortcuts.add_child(this.#shortcutRow('Abrir e fechar a ilha', 'toggle-shortcut'));
        shortcuts.add_child(this.#shortcutRow('Abrir na aba do Claude', 'claude-shortcut'));
        const hint = dimLabel('Clique em Alterar e pressione a nova combinação. Esc cancela.');
        hint.clutter_text.line_wrap = true;
        shortcuts.add_child(hint);
        return shortcuts;
    }

    #shortcutRow(text: string, key: ShortcutKey): St.BoxLayout {
        const kbd = label('', 'frodo-kbd frodo-mono');
        const change = textButton('Alterar', () => {
            this.#startCapture(change, kbd, key);
        });
        this.#bindings.push(() => {
            kbd.text = shortcutLabel(this.#shortcut(key)) || 'Nenhum';
        });
        return settingsRow(text, kbd, change);
    }

    #shortcut(key: ShortcutKey): string {
        return key === 'toggle-shortcut' ? this.#settings.toggleShortcut : this.#settings.claudeShortcut;
    }

    #startCapture(button: St.Button, kbd: St.Label, key: ShortcutKey): void {
        this.#stopCapture();
        kbd.text = 'Pressione o atalho…';
        this.#grabKeyboard(button);
        const id = button.connect('key-press-event', (_actor, event) => {
            const symbol = event.get_key_symbol();
            if (MODIFIER_KEYS.includes(symbol)) return Clutter.EVENT_STOP;
            this.#stopCapture();
            const state = event.get_state();
            const shortcut =
                symbol === Clutter.KEY_Escape
                    ? null
                    : accelerator(Clutter.keyval_name(symbol) ?? '', {
                          super: (state & (Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.MOD4_MASK)) !== 0,
                          control: (state & Clutter.ModifierType.CONTROL_MASK) !== 0,
                          alt: (state & Clutter.ModifierType.MOD1_MASK) !== 0,
                          shift: (state & Clutter.ModifierType.SHIFT_MASK) !== 0,
                      });
            if (shortcut === null || shortcut === this.#shortcut(key)) this.#sync();
            else if (key === 'toggle-shortcut') this.#settings.toggleShortcut = shortcut;
            else this.#settings.claudeShortcut = shortcut;
            return Clutter.EVENT_STOP;
        });
        this.#capture = {button, id};
    }

    #stopCapture(): void {
        if (!this.#capture) return;
        this.#capture.button.disconnect(this.#capture.id);
        this.#capture = null;
    }

    #integrations(actions: SettingsActions): St.BoxLayout {
        const integrations = card('frodo-settings-card');
        integrations.add_child(cardTitle('Integrações'));

        integrations.add_child(
            integration(
                tile(new St.Icon({gicon: frodoIcon('google'), icon_size: 18}), 'frodo-integration-google'),
                'Google Agenda',
                label('Pelas Contas Online do GNOME', 'frodo-integration-subtitle'),
                textButton('Abrir', () => {
                    actions.close();
                    spawn(['gnome-control-center', 'online-accounts']);
                }),
            ),
        );

        const usage = row('frodo-integration-usage');
        usage.add_child(label('Lendo uso de ', 'frodo-integration-subtitle'));
        usage.add_child(this.#configDir);
        integrations.add_child(
            integration(tile(new St.Icon({gicon: frodoIcon('claude'), icon_size: 18}), 'frodo-integration-claude'), 'Claude Code', usage),
        );
        return integrations;
    }

    #sync(): void {
        const visible = visibleTabs(this.#settings.hiddenTabs);
        for (const sync of this.#bindings) sync();
        for (const [id, box] of this.#tabBoxes) {
            const locked = visible.length === 1 && visible.includes(id);
            box.reactive = !locked;
            box.can_focus = !locked;
        }
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
