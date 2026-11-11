import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {PopupAnimation} from 'resource:///org/gnome/shell/ui/boxpointer.js';
import type {QuickSlider, QuickToggleMenu} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {
    closeQuickSettingsMenu,
    interceptCloseQuickSettings,
    keepMicrophoneSliderVisible,
    quickSettingsItemMenu,
    quickSettingsParts,
    quickSliderButtons,
    quickToggleMenuButton,
    quickToggleMenuHeader,
} from '../../shared/shell-internals.js';
import {Disposables} from '../../shared/disposables.js';
import type {Disposer} from '../../shared/disposables.types.js';
import {ActorLoan} from '../../shared/ui/actor-loan.js';
import {whileShown} from '../../shared/ui/lifecycle.js';
import {iconButton} from '../../shared/ui/buttons.js';
import {packGrid} from '../../shared/ui/layout.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {TILE_SPACING, TILE_COLUMNS, OVERLAY_BINDINGS} from './native-controls.const.js';
import {MenuTransition} from './menu-transition.js';
import type {SliderSlots, Toggle} from './native-controls.types.js';

function sliderSlots(): SliderSlots {
    return {
        slider: new St.Bin({visible: false}),
        icon: new St.Bin({style_class: 'frodo-sound-icon', y_align: Clutter.ActorAlign.CENTER}),
        menu: new St.Bin({style_class: 'frodo-sound-menu', y_align: Clutter.ActorAlign.CENTER}),
    };
}

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
    readonly output = sliderSlots();
    readonly input = sliderSlots();
    readonly brightness = sliderSlots();
    readonly #island: IslandHandle;
    readonly #overlayHost: St.Widget;
    readonly #content: St.Widget;
    readonly #transition: MenuTransition;
    readonly #disposables = new Disposables();
    readonly #loan = new Disposables();

    constructor(island: IslandHandle, page: Clutter.Actor, overlayHost: St.Widget, content: St.Widget, scrollToTop: () => void) {
        this.#island = island;
        this.#overlayHost = overlayHost;
        this.#content = content;
        this.#transition = new MenuTransition(page, content, scrollToTop);
        this.#disposables.add(
            whileShown(
                page,
                island,
                () => {
                    this.#borrow();
                },
                () => {
                    this.#loan.dispose();
                },
            ),
        );
    }

    #borrow(): void {
        this.#loan.dispose();
        closeQuickSettingsMenu();
        const parts = quickSettingsParts();
        if (!parts) return;
        const {isNative} = parts;

        const tiles = parts.tiles.filter(isNative);
        for (const tile of tiles) {
            this.#lend(tile, this.tiles);
            this.#fillSubtitle(tile as Toggle);
            const menuButton = quickToggleMenuButton(tile);
            if (menuButton) this.#forwardIcon(menuButton);
        }
        const sliders: QuickSlider[] = [];
        for (const [slider, slots] of [
            [parts.output, this.output],
            [parts.input, this.input],
            [parts.brightness, this.brightness],
        ] as const) {
            if (!isNative(slider)) continue;
            this.#lendSlider(slider, slots);
            sliders.push(slider);
        }
        this.#loan.add(packGrid(this.tiles, tiles, TILE_COLUMNS));

        this.#lendOverlay(parts.overlay);
        const menus = [...tiles, ...sliders].map(quickSettingsItemMenu).filter(item => item !== null);
        this.#loan.add(() => {
            this.#transition.restore(menus);
        });
        this.#loan.add(() => {
            parts.closeActiveMenu();
        });
        this.#watchMenus(menus);
        this.#loan.add(keepMicrophoneSliderVisible());
        this.#loan.add(
            interceptCloseQuickSettings(() => {
                this.#island.close();
            }),
        );
    }

    #lend(item: Clutter.Actor, target: Clutter.Actor): void {
        const loan = new ActorLoan(item, target);
        this.#loan.add(() => {
            loan.giveBack();
        });
    }

    #lendSlider(slider: QuickSlider, slots: SliderSlots): void {
        this.#lend(slider, slots.slider);
        const expand = slider.x_expand;
        slider.x_expand = true;
        const binding = slider.bind_property('visible', slots.slider, 'visible', GObject.BindingFlags.SYNC_CREATE);
        this.#loan.add(() => {
            binding.unbind();
            slots.slider.hide();
            slider.x_expand = expand;
        });
        const {icon, menu} = quickSliderButtons(slider);
        this.#lend(icon, slots.icon);
        this.#lend(menu, slots.menu);
        this.#forwardIcon(menu);
    }

    #forwardIcon(button: St.Button): void {
        const icon = button.child;
        if (!(icon instanceof St.Icon)) return;
        const original = icon.gicon;
        icon.gicon = frodoIcon('forward');
        this.#loan.add(() => {
            icon.gicon = original;
        });
    }

    #fillSubtitle(toggle: Toggle): void {
        let fallback: string | null = null;
        const sync = (): void => {
            if (toggle.subtitle && toggle.subtitle !== fallback) return;
            fallback = toggle.checked ? 'Ligado' : 'Desligado';
            if (toggle.subtitle !== fallback) toggle.subtitle = fallback;
        };
        const ids = [toggle.connect('notify::checked', sync), toggle.connect('notify::subtitle', sync)];
        sync();
        this.#loan.add(() => {
            for (const id of ids) toggle.disconnect(id);
            if (toggle.subtitle === fallback) toggle.subtitle = null;
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

    #watchMenus(menus: readonly QuickToggleMenu[]): void {
        for (const menu of menus) {
            this.#loan.add(detachConstraints(menu.actor));
            this.#addBackButton(menu);
            const id = menu.connect('open-state-changed', (_menu, open) => {
                this.#transition.push(menu, open);
            });
            this.#loan.add(() => {
                menu.disconnect(id);
            });
        }
    }

    #addBackButton(menu: QuickToggleMenu): void {
        const {header, icon} = quickToggleMenuHeader(menu);
        const layout = header.layout_manager;
        if (!(layout instanceof Clutter.GridLayout)) return;
        const back = iconButton(
            frodoIcon('back'),
            'Voltar',
            () => {
                menu.close(PopupAnimation.FULL);
            },
            'control',
        );
        layout.attach(back, 0, 0, 1, 2);
        icon.hide();
        this.#loan.add(() => {
            back.destroy();
            icon.show();
        });
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#loan.dispose();
        this.tiles.destroy();
        for (const {slider, icon, menu} of [this.output, this.input, this.brightness])
            for (const bin of [slider, icon, menu]) bin.destroy();
    }
}
