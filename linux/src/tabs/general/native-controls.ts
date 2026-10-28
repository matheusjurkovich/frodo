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
import type {Disposer} from '../../shared/disposables.js';
import {SPRING} from '../../shared/spring.js';
import {ActorLoan} from '../../shared/ui/actor-loan.js';
import {iconButton} from '../../shared/ui/buttons.js';
import {packGrid} from '../../shared/ui/layout.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {HEIGHT_AXIS, morphSize, settle, slideIn, slideOut} from '../../shared/ui/motion.js';
import type {IslandHandle} from '../../shared/island-handle.js';

const OVERLAY_BINDINGS = [Clutter.BindCoordinate.X, Clutter.BindCoordinate.Y, Clutter.BindCoordinate.WIDTH] as const;
const TILE_COLUMNS = 2;
const TILE_SPACING = 8;

export interface SliderSlots {
    readonly slider: St.Bin;
    readonly icon: St.Bin;
    readonly menu: St.Bin;
}

type Toggle = Clutter.Actor & {subtitle: string | null; checked: boolean};

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
    readonly #page: Clutter.Actor;
    readonly #overlayHost: St.Widget;
    readonly #content: St.Widget;
    readonly #scrollToTop: () => void;
    readonly #disposables = new Disposables();
    readonly #loan = new Disposables();

    constructor(island: IslandHandle, page: Clutter.Actor, overlayHost: St.Widget, content: St.Widget, scrollToTop: () => void) {
        this.#island = island;
        this.#page = page;
        this.#overlayHost = overlayHost;
        this.#content = content;
        this.#scrollToTop = scrollToTop;
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

        this.#lendOverlay(menu._overlay);
        const menus = [...tiles, ...sliders].map(quickSettingsItemMenu).filter(item => item !== null);
        this.#loan.add(() => {
            this.#restore(menus);
        });
        this.#loan.add(() => {
            menu._activeMenu?.close(PopupAnimation.NONE);
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
                this.#push(menu, open);
            });
            this.#loan.add(() => {
                menu.disconnect(id);
            });
        }
    }

    #push(menu: QuickToggleMenu, open: boolean): void {
        const content = this.#content;
        menu.actor.remove_all_transitions();
        menu.box.remove_all_transitions();
        menu.actor.height = -1;
        menu.box.opacity = 255;
        if (open) {
            this.#scrollToTop();
            morphSize(
                this.#page,
                () => {
                    content.set({height: 0, reactive: false});
                },
                SPRING,
                HEIGHT_AXIS,
            );
            content.height = -1;
            slideOut(content, 1, () => {
                settle(content);
                content.set({opacity: 0, height: 0, clip_to_allocation: true});
            });
            slideIn(menu.actor, 1);
            return;
        }
        morphSize(
            this.#page,
            () => {
                menu.actor.hide();
                content.set({height: -1, opacity: 255, reactive: true, clip_to_allocation: false});
            },
            SPRING,
            HEIGHT_AXIS,
        );
        menu.actor.show();
        slideOut(menu.actor, -1, () => {
            menu.actor.hide();
            settle(menu.actor);
            menu.emit('menu-closed');
        });
        slideIn(content, -1);
    }

    #restore(menus: readonly QuickToggleMenu[]): void {
        for (const menu of menus) {
            settle(menu.actor);
            if (menu.isOpen) continue;
            menu.actor.hide();
            menu.actor.height = 0;
            menu.box.opacity = 0;
        }
        settle(this.#content);
        this.#content.set({height: -1, opacity: 255, reactive: true, clip_to_allocation: false});
        settle(this.#page);
        this.#page.height = -1;
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
