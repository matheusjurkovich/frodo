import St from 'gi://St';

import type {Workspaces} from '../../features/workspaces/workspaces-service.js';
import {Disposables} from '../../shared/disposables.js';
import {column, dimLabel, grid, label, packGrid, row} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import type {Island} from '../../app/island.js';
import {SCREEN_HEIGHT, SCREEN_WIDTH, newWorkspaceCard, workspaceCard} from './workspace-card.js';

const COLUMNS = 5;
const SPACING = 10;

export class WorkspacesPage implements Component {
    readonly actor = column('frodo-workspaces');
    readonly #workspaces: Workspaces;
    readonly #island: Island;
    readonly #grid = grid(SPACING);
    readonly #disposables = new Disposables();
    readonly #packing = new Disposables();
    readonly #running = new Disposables();

    constructor(workspaces: Workspaces, island: Island) {
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
        const cards: St.Widget[] = this.#workspaces.snapshot(SCREEN_WIDTH, SCREEN_HEIGHT).map(info =>
            workspaceCard(info, () => {
                this.#island.close();
                this.#workspaces.activate(info.index);
            }),
        );
        cards.push(
            newWorkspaceCard(() => {
                this.#island.close();
                this.#workspaces.add();
            }),
        );
        while (cards.length < COLUMNS) cards.push(new St.Widget({x_expand: true}));
        this.#packing.dispose();
        this.#grid.destroy_all_children();
        this.#packing.add(packGrid(this.#grid, cards, COLUMNS));
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
