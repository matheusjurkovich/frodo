import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';

import {batteryLevel} from '../features/system/battery.js';
import {formatDate} from '../shared/format.js';
import {formatGb} from '../features/system/memory.js';
import type {ClosedItem} from '../settings/schema-values.js';
import {displayLevel, shownPercent} from '../features/claude/claude-usage.js';
import type {UsageWindow} from '../features/claude/claude-usage.js';
import type {ClaudeService} from '../features/claude/claude-service.js';
import type {NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {SystemState} from '../features/system/system-state-service.js';
import {
    extensionIndicators,
    networkIndicator,
    onIndicatorsChanged,
    otherSystemIndicators,
    systemIndicator,
} from '../shared/shell-internals.js';
import {Disposables} from '../shared/disposables.js';
import {Emitter} from '../shared/emitter.js';
import {Timer} from '../shared/timer.js';
import {dimLabel, label} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.js';
import {ProgressRing} from '../shared/ui/progress-ring.js';
import {frodoIcon} from '../shared/ui/icons.js';

const FADE_MS = 150;

type TextItem = Extract<ClosedItem, 'battery' | 'ram' | 'claude-session' | 'claude-weekly'>;

const TEXT_ITEMS: readonly ClosedItem[] = ['battery', 'ram', 'claude-session', 'claude-weekly'];

function isTextItem(item: ClosedItem): item is TextItem {
    return TEXT_ITEMS.includes(item);
}

interface Segment {
    readonly actor: Clutter.Actor;
    readonly isVisible: () => boolean;
    readonly update: () => void;
}

function present(actor: Clutter.Actor | null): Clutter.Actor[] {
    return actor ? [actor] : [];
}

function clockText(): string {
    return GLib.DateTime.new_now_local().format('%H:%M') ?? '';
}

export class IdleView extends Emitter<{rebuilt: []}> implements Component {
    readonly actor = new St.BoxLayout({style_class: 'frodo-pill-content'});

    readonly #settings: FrodoSettings;
    readonly #state: SystemState;
    readonly #claude: ClaudeService;
    readonly #bridge: NotificationBridge;
    readonly #clock = new GnomeDesktop.WallClock();
    readonly #rotateTimer = new Timer();
    readonly #disposables = new Disposables();
    readonly #built = new Disposables();
    #segments: Segment[] = [];
    #clockLabels: St.Label[] = [];
    #dateLabels: St.Label[] = [];
    #rotateIndex = 0;
    #rotatingSlot: St.Label | null = null;

    constructor(settings: FrodoSettings, state: SystemState, claude: ClaudeService, bridge: NotificationBridge) {
        super();
        this.#settings = settings;
        this.#state = state;
        this.#claude = claude;
        this.#bridge = bridge;

        this.#disposables.signal(
            this.#clock,
            this.#clock.connect('notify::clock', () => {
                this.#syncClock();
            }),
        );
        this.#disposables.add(
            settings.onChanged(['closed-mode', 'closed-items', 'rotate-seconds'], () => {
                this.#build();
            }),
        );
        this.#disposables.add(
            claude.on('changed', () => {
                this.#update();
            }),
        );
        this.#disposables.add(
            bridge.on('changed', () => {
                this.#update();
            }),
        );
        this.#disposables.add(
            settings.onChanged('claude-show-remaining', () => {
                this.#update();
            }),
        );
        for (const event of ['memory', 'battery'] as const)
            this.#disposables.add(
                state.on(event, () => {
                    this.#update();
                }),
            );
        this.#build();
    }

    get wantsMemory(): boolean {
        return this.#settings.closedMode !== 'minimal' && this.#settings.closedItems.includes('ram');
    }

    #syncClock(): void {
        const text = clockText();
        for (const clock of this.#clockLabels) clock.text = text;
        const date = formatDate(new Date());
        for (const day of this.#dateLabels) day.text = date;
    }

    #items(): ClosedItem[] {
        const mode = this.#settings.closedMode;
        if (mode === 'minimal') return ['clock'];
        const items = this.#settings.closedItems;
        if (mode === 'compact') return items;
        const firstText = items.findIndex(isTextItem);
        return items.filter((item, index) => !isTextItem(item) || index === firstText);
    }

    #build(): void {
        this.#rotateTimer.stop();
        this.#built.dispose();
        this.actor.destroy_all_children();
        this.#segments = [];
        this.#clockLabels = [];
        this.#dateLabels = [];
        this.#rotateIndex = 0;
        this.#rotatingSlot = null;

        const rotating = this.#settings.closedMode === 'rotating';
        for (const item of this.#items()) {
            const segment = rotating && isTextItem(item) ? this.#rotatingSegment() : this.#segment(item);
            if (!segment) continue;
            this.actor.add_child(segment.actor);
            this.#segments.push(segment);
        }
        if (rotating)
            this.#rotateTimer.every(this.#settings.rotateSeconds, () => {
                this.#rotate();
            });

        this.#syncClock();
        this.#update();
        this.emit('rebuilt');
    }

    #segment(item: ClosedItem): Segment | null {
        switch (item) {
            case 'clock':
                return this.#clockSegment();
            case 'date':
                return this.#dateSegment();
            case 'notifications':
                return this.#notificationsSegment();
            case 'network':
                return this.#cloneSegment(() => present(networkIndicator()));
            case 'bluetooth':
            case 'volume':
            case 'microphone':
            case 'do-not-disturb':
                return this.#cloneSegment(() => present(systemIndicator(item)));
            case 'system':
                return this.#cloneSegment(otherSystemIndicators);
            case 'extensions':
                return this.#cloneSegment(extensionIndicators);
            case 'battery':
                return this.#batterySegment();
            case 'ram':
                return this.#textSegment('ram');
            case 'claude-session':
            case 'claude-weekly':
                return this.#claudeSegment(item);
        }
    }

    #clockSegment(): Segment {
        const label = new St.Label({style_class: 'frodo-clock', y_align: Clutter.ActorAlign.CENTER});
        this.#clockLabels.push(label);
        return {actor: label, isVisible: () => true, update: () => undefined};
    }

    #dateSegment(): Segment {
        const date = label('', 'frodo-pill-date');
        this.#dateLabels.push(date);
        return {actor: date, isVisible: () => true, update: () => undefined};
    }

    #notificationsSegment(): Segment {
        const box = new St.BoxLayout({style_class: 'frodo-pill-notifications', y_align: Clutter.ActorAlign.CENTER});
        const count = label('', 'frodo-pill-count');
        box.add_child(new St.Icon({gicon: frodoIcon('bell'), style_class: 'frodo-pill-status-icon'}));
        box.add_child(count);
        return {
            actor: box,
            isVisible: () => this.#bridge.count > 0,
            update: () => {
                count.text = String(this.#bridge.count);
            },
        };
    }

    #cloneSegment(read: () => Clutter.Actor[]): Segment {
        const sources = read();
        const box = new St.BoxLayout({style_class: 'frodo-system-icons', y_align: Clutter.ActorAlign.CENTER});
        const clones = sources.map(source => new Clutter.Clone({source, y_align: Clutter.ActorAlign.CENTER}));
        for (const clone of clones) box.add_child(clone);
        for (const source of sources)
            this.#built.signal(
                source,
                source.connect('notify::visible', () => {
                    this.#update();
                }),
            );
        this.#built.add(
            onIndicatorsChanged(() => {
                const current = read();
                if (current.length !== sources.length || current.some((source, index) => source !== sources[index])) this.#build();
            }),
        );
        return {
            actor: box,
            isVisible: () => sources.some(source => source.visible),
            update: () => {
                clones.forEach((clone, index) => {
                    clone.visible = sources[index]?.visible ?? false;
                });
            },
        };
    }

    #batterySegment(): Segment {
        const box = new St.BoxLayout({style_class: 'frodo-battery', y_align: Clutter.ActorAlign.CENTER});
        const icon = new St.Icon({style_class: 'frodo-battery-icon'});
        const label = dimLabel();
        box.add_child(icon);
        box.add_child(label);
        return {
            actor: box,
            isVisible: () => this.#state.battery !== null,
            update: () => {
                const {battery} = this.#state;
                if (!battery) return;
                icon.gicon = frodoIcon(`battery-${batteryLevel(battery)}`);
                label.text = `${battery.percent}%`;
            },
        };
    }

    #textSegment(item: TextItem): Segment {
        const label = dimLabel();
        return {
            actor: label,
            isVisible: () => item !== 'battery' || this.#state.battery !== null,
            update: () => {
                label.text = this.#itemText(item);
            },
        };
    }

    #claudeWindow(item: 'claude-session' | 'claude-weekly'): UsageWindow | null {
        const role = item === 'claude-session' ? 'session' : 'weekly';
        return this.#claude.active?.windows.find(window => window.role === role) ?? null;
    }

    #claudeSegment(item: 'claude-session' | 'claude-weekly'): Segment {
        const box = new St.BoxLayout({style_class: 'frodo-claude', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(new St.Icon({gicon: frodoIcon('claude'), style_class: 'frodo-claude-icon'}));
        const ring = new ProgressRing();
        const value = dimLabel('—');
        box.add_child(ring.actor);
        box.add_child(value);
        return {
            actor: box,
            isVisible: () => true,
            update: () => {
                const window = this.#claudeWindow(item);
                ring.actor.visible = window !== null;
                if (!window) {
                    value.text = '—';
                    return;
                }
                const shown = shownPercent(window.utilization, this.#settings.claudeShowRemaining);
                ring.level = displayLevel(window, Date.now());
                ring.percent = shown;
                value.text = `${Math.round(shown)}%`;
            },
        };
    }

    #rotatingSegment(): Segment {
        const label = dimLabel();
        this.#rotatingSlot = label;
        return {
            actor: label,
            isVisible: () => this.#rotatingItems().length > 0,
            update: () => {
                const items = this.#rotatingItems();
                const item = items[this.#rotateIndex % Math.max(1, items.length)];
                if (item) label.text = this.#itemText(item);
            },
        };
    }

    #rotatingItems(): TextItem[] {
        return this.#settings.closedItems.filter(isTextItem).filter(item => item !== 'battery' || this.#state.battery !== null);
    }

    #itemText(item: TextItem): string {
        const {battery, memory} = this.#state;
        switch (item) {
            case 'battery':
                return battery ? `Bat ${battery.percent}%` : 'Bat —';
            case 'ram':
                return memory ? `RAM ${formatGb(memory.usedKb)}` : 'RAM —';
            case 'claude-session':
            case 'claude-weekly': {
                const window = this.#claudeWindow(item);
                const name = item === 'claude-session' ? 'Claude' : 'Semana';
                return window
                    ? `${name} ${Math.round(shownPercent(window.utilization, this.#settings.claudeShowRemaining))}%`
                    : `${name} —`;
            }
        }
    }

    #rotate(): void {
        const slot = this.#rotatingSlot;
        const count = this.#rotatingItems().length;
        if (!slot || count === 0) return;
        slot.ease({
            opacity: 0,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.#rotateIndex = (this.#rotateIndex + 1) % count;
                this.#update();
                slot.ease({opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            },
        });
    }

    #update(): void {
        for (const segment of this.#segments) {
            const visible = segment.isVisible();
            segment.actor.visible = visible;
            if (visible) segment.update();
        }
    }

    destroy(): void {
        this.#rotateTimer.stop();
        this.#built.dispose();
        this.#disposables.dispose();
        this.clearListeners();
        this.actor.destroy();
    }
}
