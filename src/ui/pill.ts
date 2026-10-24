import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import St from 'gi://St';

import {batteryIconName, ellipsize} from '../core/format.js';
import {formatGb} from '../core/memory.js';
import type {ClosedItem} from '../core/types.js';
import type {InterceptedNotification} from '../services/notification-bridge.js';
import type {FrodoSettings} from '../services/settings.js';
import type {SystemState} from '../services/system-state.js';
import {quickSettings} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {COLORS, ProgressRing, dimLabel, separator} from './widgets.js';

const FLASH_MS = 3000;
const FLASH_CHARS = 40;
const FADE_MS = 150;

type TextItem = Exclude<ClosedItem, 'clock' | 'system'>;

const TEXT_ITEMS: readonly ClosedItem[] = ['battery', 'ram', 'claude-session', 'claude-weekly'];

function isTextItem(item: ClosedItem): item is TextItem {
    return TEXT_ITEMS.includes(item);
}

interface Segment {
    readonly actor: Clutter.Actor;
    readonly separator: St.Widget;
    readonly isVisible: () => boolean;
    readonly update: () => void;
}

function clockText(): string {
    return GLib.DateTime.new_now_local().format('%H:%M') ?? '';
}

export class Pill extends Emitter<{rebuilt: []}> {
    readonly actor = new St.BoxLayout({style_class: 'frodo-pill', reactive: true, track_hover: true});

    readonly #settings: FrodoSettings;
    readonly #state: SystemState;
    readonly #content = new St.BoxLayout({style_class: 'frodo-pill-content'});
    readonly #flashBox = new St.BoxLayout({style_class: 'frodo-pill-content', visible: false});
    readonly #flashIcon = new St.Icon({style_class: 'frodo-flash-icon'});
    readonly #flashLabel = new St.Label({y_align: Clutter.ActorAlign.CENTER});
    readonly #clock = new GnomeDesktop.WallClock();
    readonly #rotateTimer = new Timer();
    readonly #flashTimer = new Timer();
    readonly #disposables = new Disposables();
    #segments: Segment[] = [];
    #clockLabels: St.Label[] = [];
    #flashQueue: InterceptedNotification[] = [];
    #rotateIndex = 0;
    #rotatingSlot: St.Label | null = null;

    constructor(settings: FrodoSettings, state: SystemState) {
        super();
        this.#settings = settings;
        this.#state = state;
        this.#flashBox.add_child(this.#flashIcon);
        this.#flashBox.add_child(this.#flashLabel);
        this.actor.add_child(this.#content);
        this.actor.add_child(this.#flashBox);

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
        for (const event of ['memory', 'battery', 'claude'] as const)
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

    flash(item: InterceptedNotification): void {
        this.#flashQueue.push(item);
        if (!this.#flashTimer.active) this.#nextFlash();
    }

    cancelFlash(): void {
        this.#flashTimer.stop();
        this.#flashQueue = [];
        this.#flashBox.hide();
        this.#content.show();
    }

    #nextFlash(): void {
        const item = this.#flashQueue.shift();
        if (!item) {
            this.cancelFlash();
            return;
        }
        this.#flashIcon.gicon = item.gicon;
        this.#flashIcon.icon_name = item.gicon ? null : 'dialog-information-symbolic';
        this.#flashLabel.text = ellipsize(item.title, FLASH_CHARS);
        this.#content.hide();
        this.#flashBox.opacity = 0;
        this.#flashBox.show();
        this.#flashBox.ease({opacity: 255, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this.#flashTimer.once(FLASH_MS, () => {
            this.#nextFlash();
        });
    }

    #syncClock(): void {
        const text = clockText();
        for (const label of this.#clockLabels) label.text = text;
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
        this.#content.destroy_all_children();
        this.#segments = [];
        this.#clockLabels = [];
        this.#rotateIndex = 0;
        this.#rotatingSlot = null;

        const rotating = this.#settings.closedMode === 'rotating';
        for (const item of this.#items()) {
            const segment = rotating && isTextItem(item) ? this.#rotatingSegment() : this.#segment(item);
            if (!segment) continue;
            this.#content.add_child(segment.separator);
            this.#content.add_child(segment.actor);
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
            case 'system':
                return this.#systemSegment();
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
        return {actor: label, separator: separator(), isVisible: () => true, update: () => undefined};
    }

    #systemSegment(): Segment | null {
        const indicators = quickSettings()?._indicators;
        if (!indicators) return null;
        const clone = new Clutter.Clone({source: indicators, y_align: Clutter.ActorAlign.CENTER});
        const box = new St.Bin({style_class: 'frodo-system-icons', child: clone, y_align: Clutter.ActorAlign.CENTER});
        return {actor: box, separator: separator(), isVisible: () => true, update: () => undefined};
    }

    #batterySegment(): Segment {
        const box = new St.BoxLayout({style_class: 'frodo-battery', y_align: Clutter.ActorAlign.CENTER});
        const icon = new St.Icon({style_class: 'frodo-battery-icon'});
        const label = dimLabel();
        box.add_child(icon);
        box.add_child(label);
        return {
            actor: box,
            separator: separator(),
            isVisible: () => this.#state.battery !== null,
            update: () => {
                const {battery} = this.#state;
                if (!battery) return;
                icon.icon_name = batteryIconName(battery);
                label.text = `${battery.percent}%`;
            },
        };
    }

    #textSegment(item: TextItem): Segment {
        const label = dimLabel();
        return {
            actor: label,
            separator: separator(),
            isVisible: () => item !== 'battery' || this.#state.battery !== null,
            update: () => {
                label.text = this.#itemText(item);
            },
        };
    }

    #claudeSegment(item: 'claude-session' | 'claude-weekly'): Segment {
        const box = new St.BoxLayout({style_class: 'frodo-claude', y_align: Clutter.ActorAlign.CENTER});
        const ring = new ProgressRing(COLORS.claude);
        const dash = dimLabel('—');
        box.add_child(ring.actor);
        box.add_child(dash);
        return {
            actor: box,
            separator: separator(),
            isVisible: () => true,
            update: () => {
                const window = item === 'claude-session' ? this.#state.claude.session : this.#state.claude.weekly;
                ring.actor.visible = window !== null;
                dash.visible = window === null;
                if (window) ring.percent = window.percent;
            },
        };
    }

    #rotatingSegment(): Segment {
        const label = dimLabel();
        this.#rotatingSlot = label;
        return {
            actor: label,
            separator: separator(),
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
        const {battery, memory, claude} = this.#state;
        switch (item) {
            case 'battery':
                return battery ? `Bat ${battery.percent}%` : 'Bat —';
            case 'ram':
                return memory ? `RAM ${formatGb(memory.usedKb)}` : 'RAM —';
            case 'claude-session':
                return claude.session ? `Claude ${Math.round(claude.session.percent)}%` : 'Claude —';
            case 'claude-weekly':
                return claude.weekly ? `Semana ${Math.round(claude.weekly.percent)}%` : 'Semana —';
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
        let anyVisibleBefore = false;
        for (const segment of this.#segments) {
            const visible = segment.isVisible();
            segment.actor.visible = visible;
            segment.separator.visible = visible && anyVisibleBefore;
            if (visible) {
                segment.update();
                anyVisibleBefore = true;
            }
        }
    }

    destroy(): void {
        this.#rotateTimer.stop();
        this.#flashTimer.stop();
        this.#disposables.dispose();
        this.clearListeners();
        this.actor.destroy();
    }
}
