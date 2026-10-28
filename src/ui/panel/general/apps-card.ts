import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import type {FrodoSettings} from '../../../services/settings.js';
import {Disposables} from '../../../util/disposables.js';
import {chip} from '../../components/buttons.js';
import {CollapsibleCard} from '../../components/collapsible-card.js';
import {column, grid, label, packGrid} from '../../components/layout.js';
import {whileMapped} from '../../components/lifecycle.js';
import type {Component} from '../../components/lifecycle.js';
import type {Island} from '../../island.js';

const COLUMNS = 4;
const SPACING = 6;
const ICON_SIZE = 32;
const SUMMARY_ICON_SIZE = 20;
const SUMMARY_LIMIT = 8;
const BADGE_OFFSET_X = 6;
const BADGE_OFFSET_Y = -4;

export class AppsCard implements Component {
    readonly #island: Island;
    readonly #apps = Shell.AppSystem.get_default();
    readonly #card: CollapsibleCard;
    readonly #grid = grid(SPACING);
    readonly #disposables = new Disposables();
    readonly #packing = new Disposables();
    readonly #running = new Disposables();

    constructor(island: Island, settings: FrodoSettings) {
        this.#island = island;
        this.#card = new CollapsibleCard('apps', 'Programas abertos', settings);
        this.#card.body.add_child(this.#grid);

        this.#disposables.add(
            whileMapped(
                this.#card.actor,
                () => {
                    const id = this.#apps.connect('app-state-changed', () => {
                        this.#render();
                    });
                    this.#running.add(() => {
                        this.#apps.disconnect(id);
                    });
                    this.#render();
                },
                () => {
                    this.#running.dispose();
                },
            ),
        );
        this.#disposables.add(() => {
            this.#packing.dispose();
        });
    }

    get actor(): St.BoxLayout {
        return this.#card.actor;
    }

    #render(): void {
        const apps = this.#apps.get_running();
        const cells: St.Widget[] = apps.map(app => this.#appButton(app));
        while (cells.length > 0 && cells.length < COLUMNS) cells.push(new St.Widget({x_expand: true}));
        this.#packing.dispose();
        this.#grid.destroy_all_children();
        this.#packing.add(packGrid(this.#grid, cells, COLUMNS));
        this.#card.setCount(apps.length);
        this.#card.setSummary(apps.length > 0 ? this.#summary(apps) : null);
    }

    #summary(apps: readonly Shell.App[]): St.BoxLayout {
        const summary = new St.BoxLayout({style_class: 'frodo-apps-summary'});
        for (const app of apps.slice(0, SUMMARY_LIMIT)) summary.add_child(app.create_icon_texture(SUMMARY_ICON_SIZE));
        return summary;
    }

    #appButton(app: Shell.App): St.Button {
        const windows = app.get_n_windows();
        const name = app.get_name();

        const icon = new St.Widget({
            style_class: 'frodo-app-icon',
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.CENTER,
        });
        const texture = app.create_icon_texture(ICON_SIZE);
        texture.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER});
        icon.add_child(texture);
        if (windows > 1) {
            const badge = chip(String(windows), 'counter');
            badge.set({
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.START,
                translation_x: BADGE_OFFSET_X,
                translation_y: BADGE_OFFSET_Y,
            });
            icon.add_child(badge);
        }

        const content = column('frodo-app-content');
        content.y_align = Clutter.ActorAlign.CENTER;
        content.add_child(icon);
        const caption = label(name, 'frodo-app-label');
        caption.x_align = Clutter.ActorAlign.CENTER;
        content.add_child(caption);
        const button = new St.Button({
            style_class: 'frodo-app',
            child: content,
            can_focus: true,
            x_expand: true,
            accessible_name: windows > 1 ? `${name}, ${windows} janelas` : name,
        });
        button.connect('clicked', () => {
            this.#island.close();
            app.activate();
        });
        return button;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#card.destroy();
    }
}
