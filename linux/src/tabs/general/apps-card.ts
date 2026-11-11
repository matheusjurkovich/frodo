import Shell from 'gi://Shell';
import St from 'gi://St';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Disposables} from '../../shared/disposables.js';
import {AppButton} from './app-button.js';
import {CollapsibleCard} from './collapsible-card.js';
import {grid, packGrid} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {SPACING, COLUMNS, SUMMARY_LIMIT, SUMMARY_ICON_SIZE} from './apps-card.const.js';

export class AppsCard implements Component {
    readonly #island: IslandHandle;
    readonly #apps = Shell.AppSystem.get_default();
    readonly #card: CollapsibleCard;
    readonly #grid = grid(SPACING);
    readonly #disposables = new Disposables();
    readonly #packing = new Disposables();
    readonly #running = new Disposables();
    readonly #buttons = new Map<Shell.App, AppButton>();
    #fillers: St.Widget[] = [];
    #shown: readonly Shell.App[] | null = null;

    constructor(island: IslandHandle, settings: FrodoSettings) {
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
                    this.#clear();
                },
            ),
        );
        this.#disposables.add(() => {
            this.#clear();
        });
    }

    get actor(): St.BoxLayout {
        return this.#card.actor;
    }

    #render(): void {
        const apps = this.#apps.get_running();
        if (this.#shown?.length === apps.length && apps.every((app, index) => app === this.#shown?.[index])) return;
        this.#shown = apps;
        this.#packing.dispose();
        for (const [app, button] of this.#buttons) {
            if (apps.includes(app)) continue;
            button.destroy();
            this.#buttons.delete(app);
        }
        for (const app of apps)
            if (!this.#buttons.has(app))
                this.#buttons.set(
                    app,
                    new AppButton(app, () => {
                        this.#island.close();
                    }),
                );
        for (const filler of this.#fillers) filler.destroy();
        this.#fillers = [];
        const cells: St.Widget[] = apps.flatMap(app => this.#buttons.get(app)?.actor ?? []);
        while (cells.length > 0 && cells.length < COLUMNS) {
            const filler = new St.Widget({x_expand: true});
            this.#fillers.push(filler);
            cells.push(filler);
        }
        this.#packing.add(packGrid(this.#grid, cells, COLUMNS));
        this.#card.setCount(apps.length);
        this.#card.setSummary(apps.length > 0 ? this.#summary(apps) : null);
    }

    #clear(): void {
        this.#packing.dispose();
        for (const button of this.#buttons.values()) button.destroy();
        this.#buttons.clear();
        for (const filler of this.#fillers) filler.destroy();
        this.#fillers = [];
        this.#shown = null;
    }

    #summary(apps: readonly Shell.App[]): St.BoxLayout {
        const summary = new St.BoxLayout({style_class: 'frodo-apps-summary'});
        for (const app of apps.slice(0, SUMMARY_LIMIT)) summary.add_child(app.create_icon_texture(SUMMARY_ICON_SIZE));
        return summary;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#card.destroy();
    }
}
