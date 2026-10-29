import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import type {HookedAgent} from '../../features/claude/agent-hooks.js';
import {isActiveProfile} from '../../features/claude/claude-profiles.js';
import {profileFor} from '../../features/claude/claude-profiles-service.js';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import {defaultConfigDir} from '../../features/claude/claude-client.js';
import {expandHome} from '../../settings/claude-profile.js';
import type {ClaudeProfile} from '../../settings/claude-profile.js';
import {accelerator, shortcutLabel} from '../../settings/shortcut.js';
import {TAB_LABELS, visibleTabs} from '../../settings/tabs.js';
import {
    GEMINI_DAILY_LIMITS,
    MEETING_NOTICE_MINUTES,
    PEEK_EVERY_MINUTES,
    PEEK_SECONDS,
    TAB_IDS,
    horizontalOf,
} from '../../settings/schema-values.js';
import type {AiProvider, ClosedItem, ClosedMode, MonitorMode, PillPosition, SurfaceStyle, TabId} from '../../settings/schema-values.js';
import type {FrodoSettings, SettingsKey} from '../../settings/frodo-settings.js';
import {spawn} from '../../shared/shell-internals.js';
import {Disposables} from '../../shared/disposables.js';
import {moveTo} from '../../shared/reorder.js';
import {dragReorder} from '../../shared/ui/drag-reorder.js';
import {nextPeek} from '../../shared/peek.js';
import {backHeader, card} from '../../shared/ui/card.js';
import {chip, iconButton, textButton} from '../../shared/ui/buttons.js';
import {column, dimLabel, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {swap} from '../../shared/ui/motion.js';
import {providerTile} from '../../shared/ui/provider-tile.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {Switch} from '../../shared/ui/switch.js';
import {Wrap} from '../../shared/ui/wrap.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import type {FrodoIconName} from '../../shared/ui/icons.js';
import {ITEM_LABELS, missingItems} from './pill-items.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const SHOW_SECONDS_KEY = 'clock-show-seconds';
const BATTERY_PERCENT_KEY = 'show-battery-percentage';
const POLL_MINUTES = {min: 1, max: 60} as const;
const ROTATE_SECONDS = {min: 2, max: 30} as const;
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

const PILL_MODES: readonly {id: ClosedMode; label: string}[] = [
    {id: 'minimal', label: 'Mínimo'},
    {id: 'compact', label: 'Compacto'},
    {id: 'rotating', label: 'Rotativo'},
];

const MODE_HINTS: Record<ClosedMode, string> = {
    minimal: 'Só o relógio, a pílula mais discreta.',
    compact: 'Todos os itens aparecem ao mesmo tempo.',
    rotating: 'Bateria, RAM e as cotas de IA dividem um espaço e se revezam.',
};

type SectionId = 'general' | 'screen' | 'pill' | 'tabs' | 'ai' | 'agenda';
type ShortcutKey = 'toggle-shortcut' | 'claude-shortcut';

interface Range {
    readonly min: number;
    readonly max: number;
}

export interface SettingsActions {
    readonly back: () => void;
    readonly close: () => void;
    readonly grabKeyboard: (focus: Clutter.Actor) => void;
    readonly overlay: St.Widget;
}

const SECTIONS: readonly {id: SectionId; label: string; icon: FrodoIconName}[] = [
    {id: 'general', label: 'Geral', icon: 'gear'},
    {id: 'screen', label: 'Tela e posição', icon: 'expand'},
    {id: 'pill', label: 'Pílula', icon: 'general'},
    {id: 'tabs', label: 'Abas', icon: 'workspaces'},
    {id: 'ai', label: 'IA', icon: 'claude'},
    {id: 'agenda', label: 'Agenda', icon: 'calendar'},
];

const POSITION_GRID: readonly (readonly ({id: PillPosition; label: string} | null)[])[] = [
    [
        {id: 'left', label: 'Topo, à esquerda'},
        {id: 'center', label: 'Topo, ao centro'},
        {id: 'right', label: 'Topo, à direita'},
    ],
    [{id: 'middle-left', label: 'Meio, à esquerda'}, null, {id: 'middle-right', label: 'Meio, à direita'}],
    [
        {id: 'bottom-left', label: 'Embaixo, à esquerda'},
        {id: 'bottom-center', label: 'Embaixo, ao centro'},
        {id: 'bottom-right', label: 'Embaixo, à direita'},
    ],
];

const GEMINI_LIMITS: readonly {id: string; label: string}[] = GEMINI_DAILY_LIMITS.map(limit => ({
    id: String(limit),
    label: limit.toLocaleString('pt-BR'),
}));

const NOTICES: readonly {id: string; label: string}[] = MEETING_NOTICE_MINUTES.map(minutes => ({
    id: String(minutes),
    label: minutes === 0 ? 'Não avisar' : `${minutes} min`,
}));

const PEEK_EVERY: readonly {id: string; label: string}[] = PEEK_EVERY_MINUTES.map(minutes => ({
    id: String(minutes),
    label: `${minutes} min`,
}));

const PEEK_FOR: readonly {id: string; label: string}[] = PEEK_SECONDS.map(seconds => ({id: String(seconds), label: `${seconds} s`}));

const HOOK_PATHS: Record<HookedAgent, string> = {codex: '~/.codex/hooks.json', gemini: '~/.gemini/settings.json'};

function wrapped(text: string, styleClass: string): St.Label {
    const result = label(text, styleClass);
    result.clutter_text.line_wrap = true;
    return result;
}

function line(title: string | St.Widget, subtitle: string | St.Widget | null, ...controls: Clutter.Actor[]): St.BoxLayout {
    const item = row('frodo-settings-line');
    const text = column('frodo-settings-line-text');
    text.x_expand = true;
    text.y_align = Clutter.ActorAlign.CENTER;
    text.add_child(typeof title === 'string' ? wrapped(title, 'frodo-settings-text') : title);
    if (subtitle !== null) text.add_child(typeof subtitle === 'string' ? wrapped(subtitle, 'frodo-settings-subtitle') : subtitle);
    item.add_child(text);
    for (const control of controls) {
        control.y_align = Clutter.ActorAlign.CENTER;
        item.add_child(control);
    }
    item.add_child(strut());
    return item;
}

function strut(): St.Widget {
    return new St.Widget({style_class: 'frodo-settings-strut'});
}

function group(title: string, lines: readonly St.Widget[], hint?: string): St.BoxLayout {
    const section = column('frodo-settings-group');
    section.add_child(label(title, 'frodo-settings-group-title'));
    const box = card('frodo-settings-group-card');
    for (const child of lines) box.add_child(child);
    section.add_child(box);
    if (hint) section.add_child(wrapped(hint, 'frodo-settings-hint'));
    return section;
}

function homePath(path: string): string {
    const home = GLib.get_home_dir();
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export class SettingsPage implements Component {
    readonly actor = column('frodo-section');
    readonly #settings: FrodoSettings;
    readonly #sessions: ClaudeSessions;
    readonly #actions: SettingsActions;
    readonly #interface = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    readonly #disposables = new Disposables();
    readonly #bindings: (() => void)[] = [];
    readonly #nav = new Map<SectionId, St.Button>();
    readonly #sections = new Map<SectionId, St.BoxLayout>();
    readonly #content = column('frodo-settings-content');
    readonly #profiles = column('frodo-settings-profiles');
    readonly #newProfile = new St.Entry({style_class: 'frodo-entry', hint_text: '~/.claude-trabalho', can_focus: true, x_expand: true});
    readonly #pillEditor = column('frodo-pill-editor');
    readonly #pillBuilt = new Disposables();
    readonly #tabList = card('frodo-settings-group-card');
    readonly #tabsBuilt = new Disposables();
    readonly #preview: Clutter.Actor;
    #section: SectionId = 'general';
    #pillFocus: ClosedItem | null = null;
    #tabFocus: TabId | null = null;
    #capture: {readonly button: St.Button; readonly id: number} | null = null;
    #destroyed = false;

    constructor(settings: FrodoSettings, sessions: ClaudeSessions, preview: Clutter.Actor, actions: SettingsActions) {
        this.#settings = settings;
        this.#preview = preview;
        this.#sessions = sessions;
        this.#actions = actions;
        this.#typing(this.#newProfile);

        this.actor.add_child(backHeader('Configurações', actions.back));
        const body = row('frodo-settings-body');
        const nav = column('frodo-settings-nav');
        nav.x_expand = false;
        nav.y_align = Clutter.ActorAlign.START;
        const content = this.#content;
        content.x_expand = true;
        const builders: Record<SectionId, () => St.Widget[]> = {
            general: () => [this.#behavior(), this.#shortcuts()],
            screen: () => [this.#position(), this.#screen()],
            pill: () => [this.#pill(), this.#peek()],
            tabs: () => [this.#tabs()],
            ai: () => [this.#usage(), this.#claude(), this.#codex(), this.#gemini()],
            agenda: () => [this.#agenda()],
        };
        for (const {id, label: text, icon} of SECTIONS) {
            const item = row('frodo-settings-nav-content');
            item.add_child(new St.Icon({gicon: frodoIcon(icon), style_class: 'frodo-settings-nav-icon'}));
            item.add_child(label(text, 'frodo-settings-nav-label'));
            const button = new St.Button({style_class: 'frodo-settings-nav-item', child: item, can_focus: true, accessible_name: text});
            button.connect('clicked', () => {
                this.#show(id);
            });
            this.#nav.set(id, button);
            nav.add_child(button);
            const section = column('frodo-settings-section');
            for (const child of builders[id]()) section.add_child(child);
            this.#sections.set(id, section);
            content.add_child(section);
        }
        body.add_child(nav);
        body.add_child(content);
        this.actor.add_child(body);

        const sync = (): void => {
            this.#sync();
        };
        const keys: SettingsKey[] = [
            'closed-mode',
            'rotate-seconds',
            'pill-position',
            'open-on-hover',
            'auto-close',
            'always-show-pill',
            'hidden-tabs',
            'monitors',
            'hide-top-bar',
            'surface-style',
            'claude-poll-minutes',
            'claude-show-remaining',
            'toggle-shortcut',
            'claude-shortcut',
            'disabled-ai',
            'gemini-daily-limit',
            'meeting-notice-minutes',
            'peek-clock',
            'peek-every-minutes',
            'peek-seconds',
        ];
        this.#disposables.add(settings.onChanged(keys, sync));
        this.#disposables.add(
            settings.onChanged('claude-profiles', () => {
                this.#renderProfiles();
            }),
        );
        this.#disposables.add(
            settings.onChanged(['closed-mode', 'closed-items', 'disabled-ai'], () => {
                this.#renderPillEditor();
            }),
        );
        for (const key of [SHOW_SECONDS_KEY, BATTERY_PERCENT_KEY])
            this.#disposables.signal(this.#interface, this.#interface.connect(`changed::${key}`, sync));
        this.#disposables.add(() => {
            this.#stopCapture();
        });
        this.#disposables.add(
            settings.onChanged(['hidden-tabs', 'tab-order'], () => {
                this.#renderTabs();
            }),
        );
        this.#disposables.add(() => {
            this.#pillBuilt.dispose();
            this.#tabsBuilt.dispose();
        });
        this.#renderProfiles();
        this.#renderPillEditor();
        this.#renderTabs();
        this.#show(this.#section);
        this.#sync();
    }

    #show(id: SectionId): void {
        const order = (section: SectionId): number => SECTIONS.findIndex(entry => entry.id === section);
        const direction = order(id) > order(this.#section) ? 1 : -1;
        const changed = id !== this.#section;
        this.#section = id;
        for (const [other, button] of this.#nav) button.checked = other === id;
        const apply = (): void => {
            for (const [other, section] of this.#sections) section.visible = other === id;
        };
        if (changed) swap(this.#content, direction, apply, 'y');
        else apply();
    }

    #typing(entry: St.Entry): void {
        entry.clutter_text.connect('key-focus-in', () => {
            this.#grabKeyboard(entry.clutter_text);
        });
    }

    #grabKeyboard(focus: Clutter.Actor): void {
        this.#actions.grabKeyboard(focus);
    }

    #switch(name: string, read: () => boolean, write: (checked: boolean) => void): St.Button {
        const toggle = this.#disposables.own(new Switch(name));
        toggle.checked = read();
        toggle.on('toggled', checked => {
            if (checked !== read()) write(checked);
        });
        this.#bindings.push(() => {
            toggle.checked = read();
        });
        return toggle.actor;
    }

    #segmented<T extends string>(options: readonly {id: T; label: string}[], read: () => T, write: (value: T) => void): St.Widget {
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
        return group('Comportamento', [
            line(
                'Abrir ao passar o mouse',
                null,
                this.#switch(
                    'Abrir ao passar o mouse',
                    () => settings.openOnHover,
                    checked => {
                        settings.openOnHover = checked;
                    },
                ),
            ),
            line(
                'Recolher sozinha após 5 s',
                'Quando aberta por clique ou atalho',
                this.#switch(
                    'Recolher sozinha após 5 s',
                    () => settings.autoClose,
                    checked => {
                        settings.autoClose = checked;
                    },
                ),
            ),
            line(
                'Mostrar segundos no relógio',
                null,
                this.#switch(
                    'Mostrar segundos no relógio',
                    () => this.#interface.get_boolean(SHOW_SECONDS_KEY),
                    checked => {
                        this.#interface.set_boolean(SHOW_SECONDS_KEY, checked);
                    },
                ),
            ),
        ]);
    }

    #shortcuts(): St.BoxLayout {
        return group(
            'Atalhos',
            [this.#shortcutRow('Abrir e fechar a ilha', 'toggle-shortcut'), this.#shortcutRow('Abrir na aba IA', 'claude-shortcut')],
            'Clique em Alterar e pressione a nova combinação. Esc cancela.',
        );
    }

    #position(): St.BoxLayout {
        const settings = this.#settings;
        const current = label('', 'frodo-settings-accent');
        const text = column('frodo-settings-line-text');
        text.x_expand = true;
        text.y_align = Clutter.ActorAlign.CENTER;
        text.add_child(label('Onde a ilha fica', 'frodo-settings-text'));
        text.add_child(current);
        text.add_child(
            wrapped(
                'A ilha flutua logo abaixo da barra superior. Nos cantos e no meio das laterais, encosta na borda; embaixo, abre para cima.',
                'frodo-settings-subtitle',
            ),
        );
        const picker = column('frodo-position-grid');
        picker.y_align = Clutter.ActorAlign.CENTER;
        const cells: {id: PillPosition; label: string; button: St.Button}[] = [];
        POSITION_GRID.forEach(cellsInRow => {
            const line = row('frodo-position-row');
            line.layout_manager.homogeneous = true;
            cellsInRow.forEach(cell => {
                if (!cell) {
                    line.add_child(new St.Widget({style_class: 'frodo-position-screen', x_expand: true}));
                    return;
                }
                const button = new St.Button({
                    style_class: 'frodo-position-cell',
                    can_focus: true,
                    x_expand: true,
                    accessible_name: cell.label,
                    child: new St.Widget({
                        style_class: 'frodo-position-mark',
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                    }),
                });
                button.connect('clicked', () => {
                    settings.pillPosition = cell.id;
                });
                cells.push({...cell, button});
                line.add_child(button);
            });
            picker.add_child(line);
        });
        this.#bindings.push(() => {
            const position = settings.pillPosition;
            for (const cell of cells) cell.button.checked = cell.id === position;
            current.text = cells.find(cell => cell.id === position)?.label ?? '';
        });
        const item = row('frodo-settings-line');
        item.add_child(text);
        item.add_child(picker);
        item.add_child(strut());
        return group('Posição', [item]);
    }

    #screen(): St.BoxLayout {
        const settings = this.#settings;
        return group('Tela', [
            line(
                'Monitores',
                'Em Ambos, cada tela tem a sua ilha',
                this.#segmented(
                    MONITORS,
                    () => settings.monitors,
                    mode => {
                        settings.monitors = mode;
                    },
                ),
            ),
            line(
                'Fundo',
                'Fosco desfoca o que está atrás. Use Sólido se a abertura ficar pesada.',
                this.#segmented(
                    SURFACES,
                    () => settings.surfaceStyle,
                    style => {
                        settings.surfaceStyle = style;
                    },
                ),
            ),
            line(
                'Ocultar barra superior',
                'Relógio, bandeja e indicadores passam a viver na ilha',
                this.#switch(
                    'Ocultar barra superior',
                    () => settings.hideTopBar,
                    checked => {
                        settings.hideTopBar = checked;
                    },
                ),
            ),
        ]);
    }

    #pill(): St.BoxLayout {
        const settings = this.#settings;
        const pill = card('frodo-settings-card');
        const header = row('frodo-settings-row');
        const title = label('Pílula', 'frodo-card-title');
        title.x_expand = true;
        title.y_align = Clutter.ActorAlign.CENTER;
        header.add_child(title);
        header.add_child(
            this.#segmented(
                PILL_MODES,
                () => settings.closedMode,
                mode => {
                    settings.closedMode = mode;
                },
            ),
        );
        pill.add_child(header);

        const frame = new St.Bin({
            style_class: 'frodo-pill frodo-pill-preview-pill',
            child: this.#preview,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const strip = new St.Widget({style_class: 'frodo-pill-preview', layout_manager: new Clutter.BinLayout(), x_expand: true});
        strip.accessible_name = 'Prévia da pílula';
        strip.add_child(frame);
        pill.add_child(strip);
        const ALIGN = {left: Clutter.ActorAlign.START, center: Clutter.ActorAlign.CENTER, right: Clutter.ActorAlign.END} as const;
        this.#bindings.push(() => {
            frame.x_align = ALIGN[horizontalOf(settings.pillPosition)];
        });

        const options = column('frodo-settings-card');
        const hint = dimLabel();
        hint.clutter_text.line_wrap = true;
        options.add_child(hint);
        const rotate = line(
            'Trocar a cada',
            null,
            this.#stepper(
                ROTATE_SECONDS,
                's',
                () => settings.rotateSeconds,
                value => {
                    settings.rotateSeconds = value;
                },
            ),
        );
        rotate.add_style_class_name('frodo-settings-line-flat');
        options.add_child(rotate);
        const percent = line(
            'Mostrar porcentagem da bateria',
            'Vale para a pílula e para a barra superior',
            this.#switch(
                'Mostrar porcentagem da bateria',
                () => this.#interface.get_boolean(BATTERY_PERCENT_KEY),
                checked => {
                    this.#interface.set_boolean(BATTERY_PERCENT_KEY, checked);
                },
            ),
        );
        percent.add_style_class_name('frodo-settings-line-flat');
        options.add_child(percent);
        const ram = line(
            'RAM em porcentagem',
            null,
            this.#switch(
                'RAM em porcentagem',
                () => settings.ramPercent,
                checked => {
                    settings.ramPercent = checked;
                },
            ),
        );
        ram.add_style_class_name('frodo-settings-line-flat');
        options.add_child(ram);
        const always = line(
            'Sempre à mostra',
            'Com janela maximizada a pílula fica no lugar, sem virar lingueta',
            this.#switch(
                'Sempre à mostra',
                () => settings.alwaysShowPill,
                checked => {
                    settings.alwaysShowPill = checked;
                },
            ),
        );
        always.add_style_class_name('frodo-settings-line-flat');
        options.add_child(always);
        this.#bindings.push(() => {
            hint.text = MODE_HINTS[settings.closedMode];
            rotate.visible = settings.closedMode === 'rotating';
        });
        const columns = row('frodo-settings-columns');
        columns.layout_manager.homogeneous = true;
        columns.add_child(options);
        columns.add_child(this.#pillEditor);
        pill.add_child(columns);
        return pill;
    }

    #peek(): St.BoxLayout {
        const settings = this.#settings;
        const every = this.#segmented(
            PEEK_EVERY,
            () => String(settings.peekEveryMinutes),
            value => {
                settings.peekEveryMinutes = Number(value);
            },
        );
        const lasts = this.#segmented(
            PEEK_FOR,
            () => String(settings.peekSeconds),
            value => {
                settings.peekSeconds = Number(value);
            },
        );
        const section = group('Tela cheia', [
            line(
                'Mostrar a hora de tempos em tempos',
                'Em tela cheia a pílula some. Ligado, ela volta por alguns segundos só com o relógio.',
                this.#switch(
                    'Mostrar a hora de tempos em tempos',
                    () => settings.peekClock,
                    checked => {
                        settings.peekClock = checked;
                    },
                ),
            ),
            line('A cada', null, every),
            line('Fica visível por', null, lasts),
        ]);
        const hint = wrapped('', 'frodo-settings-hint');
        section.add_child(hint);
        const refresh = (): void => {
            const on = settings.peekClock;
            for (const control of [every, lasts]) {
                control.reactive = on;
                control.opacity = on ? 255 : 115;
            }
            const next = GLib.DateTime.new_from_unix_local(Math.floor(nextPeek(new Date(), settings.peekEveryMinutes).getTime() / 1000));
            hint.text = on
                ? `Próxima vez às ${next.format('%H:%M') ?? ''}, por ${settings.peekSeconds} s. Passar o mouse na pílula abre a ilha.`
                : 'Desligado: em tela cheia a pílula fica escondida.';
        };
        this.#bindings.push(refresh);
        section.connect('notify::mapped', refresh);
        return section;
    }

    #renderPillEditor(): void {
        const settings = this.#settings;
        const editor = this.#pillEditor;
        this.#pillBuilt.dispose();
        editor.destroy_all_children();
        if (settings.closedMode === 'minimal') {
            editor.add_child(
                wrapped(
                    'No modo Mínimo a pílula mostra só o relógio. Escolha Compacto ou Rotativo para montar os itens.',
                    'frodo-pill-note',
                ),
            );
            return;
        }

        const items = settings.closedItems;
        editor.add_child(label('Itens, da esquerda para a direita', 'frodo-settings-text'));
        const handles: St.Button[] = [];
        const chips = items.map((item, index) => {
            const chipBox = row('frodo-pill-item');
            chipBox.x_expand = false;
            const grip = this.#grip(`Reordenar ${ITEM_LABELS[item]}: arraste ou use as setas`);
            handles.push(grip);
            chipBox.add_child(grip);
            chipBox.add_child(label(String(index + 1), 'frodo-pill-item-number frodo-mono'));
            chipBox.add_child(label(ITEM_LABELS[item], 'frodo-pill-item-name'));
            const remove = iconButton(
                frodoIcon('close'),
                `Tirar ${ITEM_LABELS[item]} da pílula`,
                () => {
                    settings.closedItems = items.filter(other => other !== item);
                },
                'ghost',
                32,
            );
            remove.add_style_class_name('frodo-pill-item-remove');
            remove.reactive = items.length > 1;
            remove.can_focus = items.length > 1;
            chipBox.add_child(remove);
            for (const child of chipBox.get_children()) child.y_align = Clutter.ActorAlign.CENTER;
            return chipBox;
        });
        const wrap = new Wrap('frodo-pill-items', chips);
        editor.add_child(wrap.actor);
        this.#pillBuilt.add(
            dragReorder({
                axis: 'x',
                host: this.#actions.overlay,
                items: chips,
                handles,
                arrange: actors => {
                    wrap.setItems(actors);
                },
                onMove: (from, to) => {
                    const item = items[from];
                    if (item === undefined) return;
                    this.#pillFocus = item;
                    settings.closedItems = moveTo(items, item, to);
                },
            }),
        );
        const focus = this.#pillFocus === null ? -1 : items.indexOf(this.#pillFocus);
        this.#pillFocus = null;
        handles[focus]?.grab_key_focus();
        const hint = wrapped('Arraste os itens para mudar a ordem. Pelo teclado, foque a alça e use ← →.', 'frodo-settings-hint');
        hint.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        editor.add_child(hint);

        const missing = missingItems(items, settings.enabledProviders);
        if (missing.length === 0) return;
        editor.add_child(label('Adicionar', 'frodo-settings-text'));
        const available = missing.map(item => {
            const button = textButton(
                ITEM_LABELS[item],
                () => {
                    settings.closedItems = [...items, item];
                },
                'ghost',
                frodoIcon('plus'),
            );
            button.add_style_class_name('frodo-pill-add');
            button.accessible_name = `Adicionar ${ITEM_LABELS[item]} à pílula`;
            return button;
        });
        editor.add_child(new Wrap('frodo-pill-items', available).actor);
    }

    #tabs(): St.BoxLayout {
        const section = column('frodo-settings-group');
        section.add_child(label('Abas visíveis', 'frodo-settings-group-title'));
        section.add_child(this.#tabList);
        section.add_child(
            wrapped(
                'Arraste para mudar a ordem das abas na ilha. Pelo teclado, foque a alça e use ↑ ↓. Uma aba escondida continua abrindo pelo atalho dela.',
                'frodo-settings-hint',
            ),
        );
        return section;
    }

    #grip(accessibleName: string): St.Button {
        return new St.Button({
            style_class: 'frodo-grip',
            child: new St.Icon({gicon: frodoIcon('grip'), style_class: 'frodo-grip-icon'}),
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: accessibleName,
        });
    }

    #renderTabs(): void {
        const settings = this.#settings;
        const list = this.#tabList;
        this.#tabsBuilt.dispose();
        list.destroy_all_children();
        const order = settings.tabOrder;
        const visible = visibleTabs(settings.hiddenTabs, order);
        const handles: St.Button[] = [];
        const lines = order.map((id, index) => {
            const toggle = this.#tabsBuilt.own(new Switch(`Mostrar a aba ${TAB_LABELS[id]}`));
            toggle.checked = visible.includes(id);
            const locked = visible.length === 1 && visible.includes(id);
            toggle.actor.reactive = !locked;
            toggle.actor.can_focus = !locked;
            toggle.on('toggled', checked => {
                const shown = visibleTabs(settings.hiddenTabs, settings.tabOrder).filter(tab => tab !== id);
                if (checked) shown.push(id);
                settings.hiddenTabs = TAB_IDS.filter(tab => !shown.includes(tab));
            });
            const title = row('frodo-tab-order-title');
            const grip = this.#grip(`Reordenar a aba ${TAB_LABELS[id]}: arraste ou use as setas`);
            handles.push(grip);
            title.add_child(grip);
            title.add_child(label(String(index + 1), 'frodo-pill-item-number frodo-mono'));
            title.add_child(label(TAB_LABELS[id], 'frodo-settings-text'));
            for (const child of title.get_children()) child.y_align = Clutter.ActorAlign.CENTER;
            const item = line(title, null, toggle.actor);
            list.add_child(item);
            return item;
        });
        this.#tabsBuilt.add(
            dragReorder({
                axis: 'y',
                host: this.#actions.overlay,
                items: lines,
                handles,
                arrange: actors => {
                    actors.forEach((actor, index) => {
                        if (actor.get_parent() !== list) list.insert_child_at_index(actor, index);
                        else list.set_child_at_index(actor, index);
                    });
                },
                onMove: (from, to) => {
                    const id = order[from];
                    if (id === undefined) return;
                    this.#tabFocus = id;
                    settings.tabOrder = moveTo(order, id, to);
                },
            }),
        );
        const focus = this.#tabFocus === null ? -1 : order.indexOf(this.#tabFocus);
        this.#tabFocus = null;
        handles[focus]?.grab_key_focus();
    }

    #usage(): St.BoxLayout {
        const settings = this.#settings;
        return group('Uso', [
            line(
                'Atualizar uso a cada',
                null,
                this.#stepper(
                    POLL_MINUTES,
                    'min',
                    () => settings.claudePollMinutes,
                    value => {
                        settings.claudePollMinutes = value;
                    },
                ),
            ),
            line(
                'Mostrar uso restante em vez do usado',
                null,
                this.#switch(
                    'Mostrar uso restante em vez do usado',
                    () => settings.claudeShowRemaining,
                    checked => {
                        settings.claudeShowRemaining = checked;
                    },
                ),
            ),
        ]);
    }

    #follow(provider: AiProvider, title: string, subtitle: string): St.BoxLayout {
        const settings = this.#settings;
        const item = line(
            label(title, 'frodo-settings-text frodo-settings-line-strong'),
            subtitle,
            this.#switch(
                title,
                () => settings.providerEnabled(provider),
                checked => {
                    settings.setProviderEnabled(provider, checked);
                },
            ),
        );
        item.insert_child_at_index(providerTile(provider, 32), 0);
        return item;
    }

    #claude(): St.BoxLayout {
        const add = (): void => {
            this.#addProfile();
        };
        this.#newProfile.clutter_text.connect('activate', add);
        const adder = row('frodo-settings-row');
        adder.add_child(this.#newProfile);
        adder.add_child(textButton('Adicionar perfil', add, 'control', frodoIcon('plus')));
        const profiles = column('frodo-settings-line frodo-settings-stack');
        profiles.add_child(label('Perfis', 'frodo-settings-text'));
        profiles.add_child(this.#profiles);
        profiles.add_child(adder);
        return group('Claude Code', [
            this.#follow('claude', 'Acompanhar o Claude Code', 'Cotas pela conta, sessões pelo hook em ~/.claude/settings.json'),
            profiles,
        ]);
    }

    #codex(): St.BoxLayout {
        return group('Codex', [
            this.#follow('codex', 'Acompanhar o Codex', 'Cotas e consumo lidos de ~/.codex/sessions'),
            this.#hookLine('codex', 'Sessões e permissões', 'Mostra o status e deixa aprovar ou negar pedidos pela ilha'),
        ]);
    }

    #gemini(): St.BoxLayout {
        const settings = this.#settings;
        return group('Gemini CLI', [
            this.#follow('gemini', 'Acompanhar o Gemini CLI', 'Tokens e sessões lidos de ~/.gemini/tmp'),
            line(
                'Limite diário de pedidos',
                'O Gemini CLI não informa a cota; a ilha conta os pedidos do dia',
                this.#segmented(
                    GEMINI_LIMITS,
                    () => String(settings.geminiDailyLimit),
                    value => {
                        settings.geminiDailyLimit = Number(value);
                    },
                ),
            ),
            this.#hookLine(
                'gemini',
                'Status das sessões',
                'O Gemini CLI não deixa responder pedidos por hook: a ilha avisa e abre o terminal',
            ),
        ]);
    }

    #hookLine(agent: HookedAgent, title: string, subtitle: string): St.BoxLayout {
        const status = wrapped('', 'frodo-settings-subtitle');
        const button = textButton('Instalar hook', () => {
            void this.#sessions.installAgentHooks(agent).then(ok => {
                if (!ok) status.text = `Não deu para mesclar ${HOOK_PATHS[agent]}. Confira se o arquivo é JSON válido.`;
                void refresh();
            });
        });
        const refresh = async (): Promise<void> => {
            const installed = await this.#sessions.agentHooksInstalled(agent);
            if (this.#destroyed) return;
            button.label = installed ? 'Instalado' : 'Instalar hook';
            button.reactive = !installed;
            button.can_focus = !installed;
            if (installed)
                status.text = `Hook em ${HOOK_PATHS[agent]}. Reinicie o ${agent === 'codex' ? 'Codex' : 'Gemini CLI'} para valer.`;
        };
        void refresh();
        const text = column('frodo-settings-line-text');
        text.add_child(wrapped(subtitle, 'frodo-settings-subtitle'));
        text.add_child(status);
        return line(title, text, button);
    }

    #agenda(): St.BoxLayout {
        const settings = this.#settings;
        const google = line(
            'Google Agenda',
            'Pelas Contas Online do GNOME',
            textButton('Abrir Contas Online', () => {
                this.#actions.close();
                spawn(['gnome-control-center', 'online-accounts']);
            }),
        );
        const icon = new St.Icon({gicon: frodoIcon('google'), icon_size: 18, x_expand: true, y_expand: true});
        icon.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        google.insert_child_at_index(new St.Bin({style_class: 'frodo-integration-icon frodo-integration-google', child: icon}), 0);
        return group('Google Agenda', [
            google,
            line(
                'Avisar na pílula antes da reunião',
                'Mostra o título e o botão Entrar',
                this.#segmented(
                    NOTICES,
                    () => String(settings.meetingNoticeMinutes),
                    value => {
                        settings.meetingNoticeMinutes = Number(value);
                    },
                ),
            ),
        ]);
    }

    #renderProfiles(): void {
        this.#profiles.destroy_all_children();
        const profiles = this.#settings.claudeProfiles;
        const defaultDir = defaultConfigDir();
        for (const profile of profiles) this.#profiles.add_child(this.#profileRow(profile, isActiveProfile(profile, defaultDir)));
        if (profiles.length === 0) this.#profiles.add_child(dimLabel('Abra a aba IA uma vez para detectar os perfis'));
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
        text.x_expand = true;
        text.add_child(name);
        text.add_child(label(homePath(profile.configDir), 'frodo-integration-subtitle frodo-mono'));
        const item = row('frodo-settings-profile-row');
        item.add_child(text);
        if (active) item.add_child(chip('ativo', 'accent'));
        item.add_child(
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
        return item;
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

    #shortcutRow(text: string, key: ShortcutKey): St.BoxLayout {
        const kbd = label('', 'frodo-kbd frodo-mono');
        const change = textButton('Alterar', () => {
            this.#startCapture(change, kbd, key);
        });
        this.#bindings.push(() => {
            kbd.text = shortcutLabel(this.#shortcut(key)) || 'Nenhum';
        });
        return line(text, null, kbd, change);
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

    #sync(): void {
        for (const sync of this.#bindings) sync();
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
