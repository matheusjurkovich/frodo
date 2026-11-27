import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import {PopupAnimation} from 'resource:///org/gnome/shell/ui/boxpointer.js';
import type {QuickSlider, QuickToggleMenu} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import type {WifiFailure} from '../../features/system/wifi-failure-service.js';
import {
    closeQuickSettingsMenu,
    interceptCloseQuickSettings,
    keepMicrophoneSliderVisible,
    quickSettingsItemMenu,
    quickSettingsParts,
    quickSliderButtons,
    quickToggleMenuButton,
    quickToggleMenuHeader,
    wirelessToggle,
} from '../../shared/shell-internals.js';
import {Disposables} from '../../shared/disposables.js';
import type {Disposer} from '../../shared/disposables.types.js';
import {ActorLoan} from '../../shared/ui/actor-loan.js';
import {FaultBanner} from '../../shared/ui/fault-banner.js';
import {whileShown} from '../../shared/ui/lifecycle.js';
import {contentButton, iconButton} from '../../shared/ui/buttons.js';
import {column, label, packGrid, row} from '../../shared/ui/layout.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {reveal, springEase} from '../../shared/ui/motion.js';
import {SPRING} from '../../shared/spring.const.js';
import type {TabTarget} from '../../shared/tab-target.types.js';
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

function tileGrid(): St.Widget {
    return new St.Widget({
        layout_manager: new Clutter.GridLayout({
            column_spacing: TILE_SPACING,
            row_spacing: TILE_SPACING,
            column_homogeneous: true,
        }),
        x_expand: true,
    });
}

function detachConstraints(actor: Clutter.Actor): Disposer {
    const constraints = actor.get_constraints();
    for (const constraint of constraints) actor.remove_constraint(constraint);
    return () => {
        for (const constraint of constraints) actor.add_constraint(constraint);
    };
}

export class NativeControls {
    readonly tiles = column('frodo-quick');
    readonly #grid = tileGrid();
    readonly #moreGrid = tileGrid();
    readonly #more: St.Button;
    readonly #moreSummary = label('', 'frodo-more-summary');
    readonly #moreCaret = new St.Icon({gicon: frodoIcon('expand'), style_class: 'frodo-more-caret', y_align: Clutter.ActorAlign.CENTER});
    #moreOpen = false;
    readonly output = sliderSlots();
    readonly input = sliderSlots();
    readonly brightness = sliderSlots();
    readonly #island: IslandHandle;
    readonly #wifi: WifiFailure;
    readonly #overlayHost: St.Widget;
    readonly #content: St.Widget;
    readonly #transition: MenuTransition;
    readonly #disposables = new Disposables();
    readonly #loan = new Disposables();
    #pending: TabTarget | null = null;

    constructor(
        island: IslandHandle,
        wifi: WifiFailure,
        page: Clutter.Actor,
        overlayHost: St.Widget,
        content: St.Widget,
        scrollToTop: () => void,
    ) {
        this.#island = island;
        this.#wifi = wifi;
        this.#overlayHost = overlayHost;
        this.#content = content;
        this.#transition = new MenuTransition(page, content, scrollToTop);

        const header = row('frodo-more-content');
        header.add_child(label('Mais ajustes', 'frodo-more-title'));
        this.#moreSummary.set({x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        header.add_child(this.#moreSummary);
        header.add_child(this.#moreCaret);
        this.#more = contentButton(
            'frodo-more',
            header,
            () => {
                this.#setMoreOpen(!this.#moreOpen);
            },
            {x_expand: true, accessible_name: 'Mais ajustes', visible: false},
        );
        this.#moreCaret.set_pivot_point(0.5, 0.5);
        this.#moreGrid.visible = false;
        for (const child of [this.#grid, this.#more, this.#moreGrid]) this.tiles.add_child(child);
        this.#disposables.add(
            whileShown(
                page,
                island,
                () => {
                    this.#borrow();
                },
                () => {
                    this.#pending = null;
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

        const primary = parts.tiles.filter(isNative);
        const secondary = parts.moreTiles.filter(isNative);
        const tiles = [...primary, ...secondary];
        for (const tile of tiles) {
            this.#lend(tile, primary.includes(tile) ? this.#grid : this.#moreGrid);
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
        this.#loan.add(packGrid(this.#grid, primary, TILE_COLUMNS));
        this.#loan.add(packGrid(this.#moreGrid, secondary, TILE_COLUMNS));
        this.#watchMore(secondary as Toggle[]);

        this.#lendOverlay(parts.overlay);
        const menus = [...tiles, ...sliders].map(quickSettingsItemMenu).filter(item => item !== null);
        this.#loan.add(() => {
            this.#transition.restore(menus);
        });
        this.#loan.add(() => {
            parts.closeActiveMenu();
        });
        this.#watchMenus(menus);
        const wireless = wirelessToggle();
        const wirelessMenu = wireless && tiles.includes(wireless) ? quickSettingsItemMenu(wireless) : null;
        if (wirelessMenu) this.#lendWifiBanner(wirelessMenu);
        this.#loan.add(keepMicrophoneSliderVisible());
        this.#loan.add(
            interceptCloseQuickSettings(() => {
                this.#island.close();
            }),
        );
        this.#openPending();
    }

    openMenu(target: TabTarget): void {
        this.#pending = target;
    }

    #openPending(): void {
        const target = this.#pending;
        this.#pending = null;
        const toggle = target === 'wifi' ? wirelessToggle() : null;
        if (toggle) quickSettingsItemMenu(toggle)?.open(PopupAnimation.NONE);
    }

    #setMoreOpen(open: boolean): void {
        this.#moreOpen = open;
        reveal(this.#moreGrid, open);
        springEase(this.#moreCaret, {rotationAngleZ: open ? 180 : 0}, SPRING);
    }

    #watchMore(toggles: readonly Toggle[]): void {
        const sync = (): void => {
            const shown = toggles.filter(toggle => toggle.visible);
            this.#more.visible = shown.length > 0;
            const on = shown.filter(toggle => toggle.checked).map(toggle => toggle.title ?? '');
            this.#moreSummary.text = on.length > 0 ? `Ligado: ${on.join(' · ')}` : shown.map(toggle => toggle.title ?? '').join(' · ');
        };
        const ids = toggles.map(
            toggle =>
                [
                    toggle,
                    [
                        toggle.connect('notify::visible', sync),
                        toggle.connect('notify::checked', sync),
                        toggle.connect('notify::title', sync),
                    ],
                ] as const,
        );
        sync();
        this.#loan.add(() => {
            for (const [toggle, toggleIds] of ids) for (const id of toggleIds) toggle.disconnect(id);
            this.#more.hide();
        });
    }

    #lendWifiBanner(menu: QuickToggleMenu): void {
        const wifi = this.#wifi;
        const banner = new FaultBanner();
        menu.box.insert_child_above(banner.actor, quickToggleMenuHeader(menu).header);
        let shown: string | null = null;
        const sync = (): void => {
            const failure = wifi.failure;
            if (failure) {
                const network = failure.network;
                shown = network;
                banner.show({
                    tone: 'danger',
                    title: `Não deu para conectar em ${network}`,
                    body:
                        failure.reason === 'password'
                            ? 'A rede recusou a senha. Confira a senha com quem administra a rede e tente de novo.'
                            : 'A conexão falhou antes de terminar. Tente de novo ou escolha outra rede.',
                    primary: {
                        label: 'Digitar a senha de novo',
                        run: () => {
                            wifi.retry();
                        },
                    },
                    secondary: {
                        label: 'Esquecer a rede',
                        confirm: {
                            text: `Esquecer ${network}? A senha salva é apagada e o Ubuntu para de conectar nela sozinho.`,
                            label: 'Esquecer',
                        },
                        run: () => {
                            void wifi.forget();
                        },
                    },
                });
                return;
            }
            const resolution = wifi.resolution;
            if (shown !== null && resolution === 'connected') banner.done(`Conectado a ${shown}.`);
            else if (shown !== null && resolution === 'forgotten')
                banner.done(`${shown} foi esquecida. Para voltar, escolha a rede e digite a senha.`);
            else banner.show(null);
            shown = null;
        };
        const off = wifi.on('changed', sync);
        sync();
        this.#loan.add(() => {
            off();
            banner.destroy();
        });
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
