import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {interceptCloseQuickSettings, quickSettings} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import type {Island} from './island.js';

interface Loan {
    readonly grid: St.Widget;
    readonly overlay: Clutter.Actor;
    readonly gridParent: Clutter.Actor;
    readonly gridIndex: number;
    readonly overlayParent: Clutter.Actor;
    readonly overlayIndex: number;
    readonly overlayConstraints: Clutter.Constraint[];
    readonly cleanup: Disposables;
}

export class NativeQuickSettings {
    readonly actor = new St.Widget({style_class: 'quick-settings frodo-quick-settings', x_expand: true});
    readonly #island: Island;
    readonly #disposables = new Disposables();
    #loan: Loan | null = null;

    constructor(island: Island) {
        this.#island = island;
        this.#disposables.add(
            island.on('opening', () => {
                this.#borrow();
            }),
        );
        this.#disposables.add(
            island.on('closed', () => {
                this.#giveBack();
            }),
        );
    }

    #borrow(): void {
        this.#giveBack();
        const menu = quickSettings()?.menu;
        const gridParent = menu?._grid.get_parent();
        const overlayParent = menu?._overlay.get_parent();
        if (!menu || !gridParent || !overlayParent) return;

        const {_grid: grid, _overlay: overlay} = menu;
        const loan: Loan = {
            grid,
            overlay,
            gridParent,
            gridIndex: gridParent.get_children().indexOf(grid),
            overlayParent,
            overlayIndex: overlayParent.get_children().indexOf(overlay),
            overlayConstraints: overlay.get_constraints(),
            cleanup: new Disposables(),
        };

        for (const constraint of loan.overlayConstraints) overlay.remove_constraint(constraint);
        gridParent.remove_child(grid);
        overlayParent.remove_child(overlay);
        this.actor.add_child(grid);
        this.actor.add_child(overlay);
        for (const coordinate of [Clutter.BindCoordinate.X, Clutter.BindCoordinate.Y, Clutter.BindCoordinate.WIDTH])
            overlay.add_constraint_with_name(`frodo-${coordinate}`, new Clutter.BindConstraint({coordinate, source: grid}));
        grid.add_constraint_with_name(
            'frodo-width',
            new Clutter.BindConstraint({coordinate: Clutter.BindCoordinate.WIDTH, source: this.actor}),
        );
        overlay.show();
        loan.cleanup.add(
            interceptCloseQuickSettings(() => {
                this.#island.close();
            }),
        );
        this.#loan = loan;
    }

    #giveBack(): void {
        const loan = this.#loan;
        if (!loan) return;
        this.#loan = null;
        loan.cleanup.dispose();
        quickSettings()?.menu._activeMenu?.close(false);

        const {grid, overlay} = loan;
        for (const coordinate of [Clutter.BindCoordinate.X, Clutter.BindCoordinate.Y, Clutter.BindCoordinate.WIDTH])
            overlay.remove_constraint_by_name(`frodo-${coordinate}`);
        grid.remove_constraint_by_name('frodo-width');
        this.actor.remove_child(grid);
        this.actor.remove_child(overlay);
        loan.gridParent.insert_child_at_index(grid, Math.min(loan.gridIndex, loan.gridParent.get_n_children()));
        loan.overlayParent.insert_child_at_index(overlay, Math.min(loan.overlayIndex, loan.overlayParent.get_n_children()));
        for (const constraint of loan.overlayConstraints) overlay.add_constraint(constraint);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#giveBack();
        this.actor.destroy();
    }
}
