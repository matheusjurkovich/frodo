import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {interceptCloseQuickSettings, keepMicrophoneSliderVisible, quickSettings} from '../shell/internals.js';
import {Disposables} from '../util/disposables.js';
import {ActorLoan} from './actor-loan.js';
import type {Island} from './island.js';

const OVERLAY_BINDINGS = [Clutter.BindCoordinate.X, Clutter.BindCoordinate.Y, Clutter.BindCoordinate.WIDTH] as const;

export class NativeQuickSettings {
    readonly actor = new St.Widget({style_class: 'quick-settings frodo-quick-settings', x_expand: true});
    readonly #island: Island;
    readonly #disposables = new Disposables();
    readonly #loan = new Disposables();

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
        if (!menu?._grid.get_parent() || !menu._overlay.get_parent()) return;
        const {_grid: grid, _overlay: overlay} = menu;

        const originalConstraints = overlay.get_constraints();
        for (const constraint of originalConstraints) overlay.remove_constraint(constraint);
        this.#loan.add(() => {
            for (const constraint of originalConstraints) overlay.add_constraint(constraint);
        });

        const gridLoan = new ActorLoan(grid, this.actor);
        const overlayLoan = new ActorLoan(overlay, this.actor);
        this.#loan.add(() => {
            overlayLoan.giveBack();
            gridLoan.giveBack();
        });

        for (const coordinate of OVERLAY_BINDINGS)
            overlay.add_constraint_with_name(`frodo-${coordinate}`, new Clutter.BindConstraint({coordinate, source: grid}));
        grid.add_constraint_with_name(
            'frodo-width',
            new Clutter.BindConstraint({coordinate: Clutter.BindCoordinate.WIDTH, source: this.actor}),
        );
        this.#loan.add(() => {
            grid.remove_constraint_by_name('frodo-width');
            for (const coordinate of OVERLAY_BINDINGS) overlay.remove_constraint_by_name(`frodo-${coordinate}`);
        });

        overlay.show();
        this.#loan.add(keepMicrophoneSliderVisible());
        this.#loan.add(
            interceptCloseQuickSettings(() => {
                this.#island.close();
            }),
        );
        this.#loan.add(() => {
            menu._activeMenu?.close(false);
        });
    }

    #giveBack(): void {
        this.#loan.dispose();
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#giveBack();
        this.actor.destroy();
    }
}
