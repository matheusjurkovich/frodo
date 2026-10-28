import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {PopupAnimation} from 'resource:///org/gnome/shell/ui/boxpointer.js';
import type {QuickSlider} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {
    closeQuickSettingsMenu,
    interceptCloseQuickSettings,
    keepMicrophoneSliderVisible,
    quickSettingsItemMenu,
    quickSettingsParts,
} from '../../../shell/internals.js';
import {Disposables} from '../../../util/disposables.js';
import type {Disposer} from '../../../util/disposables.js';
import {ActorLoan} from '../../actor-loan.js';
import {packGrid} from '../../components/layout.js';
import type {Island} from '../../island.js';

const OVERLAY_BINDINGS = [Clutter.BindCoordinate.X, Clutter.BindCoordinate.Y, Clutter.BindCoordinate.WIDTH] as const;
const TILE_COLUMNS = 2;
const TILE_SPACING = 8;

function detachConstraints(actor: Clutter.Actor): Disposer {
    const constraints = actor.get_constraints();
    for (const constraint of constraints) actor.remove_constraint(constraint);
    return () => {
        for (const constraint of constraints) actor.add_constraint(constraint);
    };
}

export class NativeControls {
    readonly tiles = new St.Widget({
        layout_manager: new Clutter.GridLayout({
            column_spacing: TILE_SPACING,
            row_spacing: TILE_SPACING,
            column_homogeneous: true,
        }),
        x_expand: true,
    });
    readonly output = new St.Bin({visible: false});
    readonly input = new St.Bin({visible: false});
    readonly brightness = new St.Bin({visible: false});
    readonly #island: Island;
    readonly #overlayHost: St.Widget;
    readonly #content: St.Widget;
    readonly #disposables = new Disposables();
    readonly #loan = new Disposables();

    constructor(island: Island, overlayHost: St.Widget, content: St.Widget) {
        this.#island = island;
        this.#overlayHost = overlayHost;
        this.#content = content;
        this.#disposables.add(
            island.on('opening', () => {
                this.#borrow();
            }),
        );
        this.#disposables.add(
            island.on('closed', () => {
                this.#loan.dispose();
            }),
        );
    }

    #borrow(): void {
        this.#loan.dispose();
        closeQuickSettingsMenu();
        const parts = quickSettingsParts();
        if (!parts || parts.menu._overlay.get_parent() !== parts.menu.actor) return;
        const {menu} = parts;
        const isNative = (item: Clutter.Actor | null): item is Clutter.Actor => item?.get_parent() === menu._grid;

        const tiles = parts.tiles.filter(isNative);
        for (const tile of tiles) this.#lend(tile, this.tiles);
        const sliders: QuickSlider[] = [];
        for (const [slider, bin] of [
            [parts.output, this.output],
            [parts.input, this.input],
            [parts.brightness, this.brightness],
        ] as const) {
            if (!isNative(slider)) continue;
            this.#lendSlider(slider, bin);
            sliders.push(slider);
        }
        this.#loan.add(packGrid(this.tiles, tiles, TILE_COLUMNS));

        this.#lendOverlay(menu._overlay);
        this.#watchMenus([...tiles, ...sliders]);
        this.#loan.add(keepMicrophoneSliderVisible());
        this.#loan.add(
            interceptCloseQuickSettings(() => {
                this.#island.close();
            }),
        );
        this.#loan.add(() => {
            menu._activeMenu?.close(PopupAnimation.NONE);
        });
    }

    #lend(item: Clutter.Actor, target: Clutter.Actor): void {
        const loan = new ActorLoan(item, target);
        this.#loan.add(() => {
            loan.giveBack();
        });
    }

    #lendSlider(slider: QuickSlider, bin: St.Bin): void {
        this.#lend(slider, bin);
        const binding = slider.bind_property('visible', bin, 'visible', GObject.BindingFlags.SYNC_CREATE);
        this.#loan.add(() => {
            binding.unbind();
            bin.hide();
        });
    }

    #lendOverlay(overlay: Clutter.Actor): void {
        this.#loan.add(detachConstraints(overlay));
        this.#lend(overlay, this.#overlayHost);
        for (const coordinate of OVERLAY_BINDINGS)
            overlay.add_constraint_with_name(`frodo-${coordinate}`, new Clutter.BindConstraint({coordinate, source: this.#content}));
        this.#loan.add(() => {
            for (const coordinate of OVERLAY_BINDINGS) overlay.remove_constraint_by_name(`frodo-${coordinate}`);
        });
        overlay.show();
    }

    #watchMenus(items: readonly Clutter.Actor[]): void {
        const menus = items.map(quickSettingsItemMenu).filter(menu => menu !== null);
        const sync = (): void => {
            const open = menus.some(menu => menu.isOpen);
            this.#content.set({opacity: open ? 0 : 255, reactive: !open});
        };
        for (const menu of menus) {
            this.#loan.add(detachConstraints(menu.actor));
            const id = menu.connect('open-state-changed', sync);
            this.#loan.add(() => {
                menu.disconnect(id);
            });
        }
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#loan.dispose();
        this.tiles.destroy();
        this.output.destroy();
        this.input.destroy();
        this.brightness.destroy();
    }
}
