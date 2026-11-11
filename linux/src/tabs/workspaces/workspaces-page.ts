import St from 'gi://St';
import type {Workspaces} from '../../features/workspaces/workspaces-service.js';
import {Disposables} from '../../shared/disposables.js';
import {Timer} from '../../shared/timer.js';
import {column, dimLabel, grid, label, packGrid, row} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {newWorkspaceCard, WorkspaceCard} from './workspace-card.js';
import {SCREEN_HEIGHT, SCREEN_WIDTH} from './workspace-card.const.js';
import {REFRESH_SECONDS, SPACING, COLUMNS} from './workspaces-page.const.js';

export class WorkspacesPage implements Component {
    readonly actor = column('frodo-workspaces');
    readonly #workspaces: Workspaces;
    readonly #island: IslandHandle;
    readonly #grid = grid(SPACING);
    readonly #disposables = new Disposables();
    readonly #packing = new Disposables();
    readonly #running = new Disposables();
    readonly #cards: WorkspaceCard[] = [];
    #newCard: St.Button | null = null;
    #spacers: St.Widget[] = [];

    constructor(workspaces: Workspaces, island: IslandHandle) {
        this.#workspaces = workspaces;
        this.#island = island;

        const hint = row('frodo-workspaces-hint');
        hint.add_child(label('Super + Page Up/Down', 'frodo-kbd frodo-mono'));
        hint.add_child(dimLabel('alterna entre áreas.'));
        this.actor.add_child(this.#grid);
        this.actor.add_child(hint);

        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#running.add(
                        workspaces.on('changed', () => {
                            this.#render();
                        }),
                    );
                    this.#running.own(new Timer()).every(REFRESH_SECONDS, () => {
                        this.#render();
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

    #render(): void {
        const infos = this.#workspaces.snapshot(SCREEN_WIDTH, SCREEN_HEIGHT);
        const rebuild = infos.length !== this.#cards.length || !this.#newCard;
        while (this.#cards.length > infos.length) this.#cards.pop()?.destroy();
        infos.forEach((info, index) => {
            let card = this.#cards[index];
            if (!card) {
                card = new WorkspaceCard(target => {
                    this.#island.close();
                    this.#workspaces.activate(target);
                });
                this.#cards.push(card);
            }
            card.update(info);
        });
        if (!rebuild) return;
        this.#newCard ??= newWorkspaceCard(() => {
            this.#island.close();
            this.#workspaces.add();
        });
        const cells: St.Widget[] = [...this.#cards.map(card => card.actor), this.#newCard];
        for (const spacer of this.#spacers) spacer.destroy();
        this.#spacers = [];
        while (cells.length < COLUMNS) {
            const spacer = new St.Widget({x_expand: true});
            this.#spacers.push(spacer);
            cells.push(spacer);
        }
        this.#packing.dispose();
        for (const cell of this.#grid.get_children()) this.#grid.remove_child(cell);
        this.#packing.add(packGrid(this.#grid, cells, COLUMNS));
    }

    destroy(): void {
        this.#disposables.dispose();
        for (const card of this.#cards) card.destroy();
        this.actor.destroy();
    }
}
