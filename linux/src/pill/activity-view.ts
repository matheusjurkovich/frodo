import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {TabId} from '../settings/schema-values.types.js';
import {Disposables} from '../shared/disposables.js';
import {Timer} from '../shared/timer.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import type {PillActivity} from './activity-feed.types.js';
import {queueLabel} from './activity-queue.js';
import {buildRow} from './activity-rows.js';
import type {ActivityRow} from './activity-rows.types.js';
import type {ActivityServices} from './activity-view.types.js';

export class ActivityView implements Component {
    readonly actor = new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true});

    readonly #services: ActivityServices;
    readonly #disposables = new Disposables();
    readonly #ticker = this.#disposables.own(new Timer());
    #content: St.BoxLayout | null = null;
    #row: ActivityRow | null = null;
    #kind: PillActivity['kind'] | null = null;
    #vertical = false;
    #queueChip: St.Label | null = null;

    constructor(services: ActivityServices) {
        this.#services = services;
        this.actor.connect('destroy', () => {
            this.#disposables.dispose();
        });
    }

    get hasAction(): boolean {
        return this.#row?.hasAction ?? false;
    }

    get clickTab(): TabId | null {
        return this.#row?.clickTab ?? null;
    }

    get content(): St.BoxLayout | null {
        return this.#content;
    }

    activate(): boolean {
        const tab = this.clickTab;
        if (tab === null) return false;
        this.#services.actions.openTab(tab);
        return true;
    }

    show(activity: PillActivity, vertical: boolean, queue: readonly PillActivity[]): void {
        const refresh = this.#row?.refresh;
        if (refresh && this.#kind === activity.kind && this.#vertical === vertical) {
            refresh(activity);
            this.#chip(queue, vertical);
            return;
        }
        this.clear();
        const row = buildRow(activity, this.#services);
        const content = new St.BoxLayout({
            style_class: 'frodo-pill-content',
            x_expand: true,
            orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
        });
        for (const child of row.children) {
            if (vertical) child.x_align = Clutter.ActorAlign.CENTER;
            content.add_child(child);
        }
        this.actor.add_child(content);
        this.#content = content;
        this.#chip(queue, vertical);
        this.#row = row;
        this.#kind = activity.kind;
        this.#vertical = vertical;
        if (row.tick) {
            row.tick.update();
            this.#ticker.every(row.tick.seconds, row.tick.update);
        }
    }

    #chip(queue: readonly PillActivity[], vertical: boolean): void {
        const content = this.#content;
        if (!content) return;
        this.#queueChip?.destroy();
        this.#queueChip = null;
        if (queue.length === 0) return;
        const chip = new St.Label({
            style_class: 'frodo-pill-queue',
            text: `+${queue.length}`,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL,
            accessible_name: queueLabel(queue),
        });
        const first = content.get_children().find(child => child instanceof St.Button);
        if (first) content.insert_child_below(chip, first);
        else content.add_child(chip);
        this.#queueChip = chip;
    }

    takeContent(): St.BoxLayout | null {
        const content = this.#content;
        this.#ticker.stop();
        this.#content = null;
        this.#row = null;
        this.#kind = null;
        this.#queueChip = null;
        if (content) this.actor.remove_child(content);
        return content;
    }

    clear(): void {
        this.takeContent()?.destroy();
    }

    destroy(): void {
        this.actor.destroy();
    }
}
