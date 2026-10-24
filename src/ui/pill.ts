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
import {Disposables} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {COLORS, ProgressRing, dimLabel, separator} from './widgets.js';

const FLASH_MS = 3000;
const FLASH_CHARS = 40;
const FADE_MS = 150;

type ClaudeItem = Extract<ClosedItem, 'claude-session' | 'claude-weekly'>;

interface BatteryWidgets {
    readonly box: St.BoxLayout;
    readonly icon: St.Icon;
    readonly label: St.Label;
    readonly separator: St.Widget;
}

interface ClaudeWidgets {
    readonly item: ClaudeItem;
    readonly ring: ProgressRing;
    readonly dash: St.Label;
}

interface CompactWidgets {
    battery: BatteryWidgets | null;
    ram: St.Label | null;
    claude: ClaudeWidgets[];
}

interface RotatingWidgets {
    readonly separator: St.Widget;
    readonly slot: St.Label;
    index: number;
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
    readonly #clockLabel = new St.Label({style_class: 'frodo-clock', y_align: Clutter.ActorAlign.CENTER});
    readonly #rotateTimer = new Timer();
    readonly #flashTimer = new Timer();
    readonly #disposables = new Disposables();
    #flashQueue: InterceptedNotification[] = [];
    #compact: CompactWidgets | null = null;
    #rotating: RotatingWidgets | null = null;

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
        this.#clockLabel.text = clockText();
    }

    #build(): void {
        this.#rotateTimer.stop();
        if (this.#clockLabel.get_parent()) this.#content.remove_child(this.#clockLabel);
        this.#content.destroy_all_children();
        this.#compact = null;
        this.#rotating = null;
        this.#syncClock();

        switch (this.#settings.closedMode) {
            case 'minimal':
                this.#content.add_child(this.#clockLabel);
                break;
            case 'rotating':
                this.#buildRotating();
                break;
            case 'compact':
                this.#buildCompact();
                break;
        }
        this.#update();
        this.emit('rebuilt');
    }

    #buildRotating(): void {
        const widgets: RotatingWidgets = {separator: separator(), slot: dimLabel(), index: 0};
        this.#content.add_child(this.#clockLabel);
        this.#content.add_child(widgets.separator);
        this.#content.add_child(widgets.slot);
        this.#rotating = widgets;
        this.#rotateTimer.every(this.#settings.rotateSeconds, () => {
            this.#rotate();
        });
    }

    #buildCompact(): void {
        const items = this.#settings.closedItems;
        const widgets: CompactWidgets = {battery: null, ram: null, claude: []};

        if (items.includes('battery')) {
            const battery: BatteryWidgets = {
                box: new St.BoxLayout({style_class: 'frodo-battery', y_align: Clutter.ActorAlign.CENTER}),
                icon: new St.Icon({style_class: 'frodo-battery-icon'}),
                label: dimLabel(),
                separator: separator(),
            };
            battery.box.add_child(battery.icon);
            battery.box.add_child(battery.label);
            this.#content.add_child(battery.box);
            this.#content.add_child(battery.separator);
            widgets.battery = battery;
        }

        this.#content.add_child(this.#clockLabel);

        for (const item of items) {
            if (item === 'battery') continue;
            if (item === 'ram') {
                widgets.ram = dimLabel();
                this.#content.add_child(separator());
                this.#content.add_child(widgets.ram);
                continue;
            }
            const claude: ClaudeWidgets = {item, ring: new ProgressRing(COLORS.claude), dash: dimLabel('—')};
            this.#content.add_child(claude.ring.actor);
            this.#content.add_child(claude.dash);
            widgets.claude.push(claude);
        }
        this.#compact = widgets;
    }

    #visibleItems(): ClosedItem[] {
        return this.#settings.closedItems.filter(item => item !== 'battery' || this.#state.battery !== null);
    }

    #itemText(item: ClosedItem): string {
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
        const rotating = this.#rotating;
        const count = this.#visibleItems().length;
        if (!rotating || count === 0) return;
        rotating.slot.ease({
            opacity: 0,
            duration: FADE_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                rotating.index = (rotating.index + 1) % count;
                this.#update();
                rotating.slot.ease({opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
            },
        });
    }

    #update(): void {
        if (this.#rotating) this.#updateRotating(this.#rotating);
        if (this.#compact) this.#updateCompact(this.#compact);
    }

    #updateRotating(widgets: RotatingWidgets): void {
        const items = this.#visibleItems();
        const item = items[widgets.index % Math.max(1, items.length)];
        widgets.slot.visible = item !== undefined;
        widgets.separator.visible = item !== undefined;
        if (item) widgets.slot.text = this.#itemText(item);
    }

    #updateCompact(widgets: CompactWidgets): void {
        const {battery, claude} = this.#state;
        if (widgets.battery) {
            widgets.battery.box.visible = battery !== null;
            widgets.battery.separator.visible = battery !== null;
            if (battery) {
                widgets.battery.icon.icon_name = batteryIconName(battery);
                widgets.battery.label.text = `${battery.percent}%`;
            }
        }
        if (widgets.ram) widgets.ram.text = this.#itemText('ram');
        for (const {item, ring, dash} of widgets.claude) {
            const window = item === 'claude-session' ? claude.session : claude.weekly;
            ring.actor.visible = window !== null;
            dash.visible = window === null;
            if (window) ring.percent = window.percent;
        }
    }

    destroy(): void {
        this.#rotateTimer.stop();
        this.#flashTimer.stop();
        this.#disposables.dispose();
        this.clearListeners();
        this.#clockLabel.destroy();
        this.actor.destroy();
    }
}
