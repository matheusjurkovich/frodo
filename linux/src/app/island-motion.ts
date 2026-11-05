import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Disposables} from '../shared/disposables.js';
import {springWithin} from '../shared/spring.js';
import {GENTLE_SPRING, SOFT_SPRING} from '../shared/spring.const.js';
import {settle, springEase} from '../shared/ui/motion.js';
import type {IslandPlacement} from './island-placement.js';
import {
    BLUR,
    CONTENT_OPEN_SCALE,
    FOLLOW,
    CONTENT_FADE_IN_MS,
    FADE_OUT_MS,
    BLUR_RADIUS,
    CLOSE_FADE_MS,
    CONTENT_CLOSE_SCALE,
    FADE_IN_MS,
} from './island-motion.const.js';
import type {IslandMotionDependencies} from './island-motion.types.js';

export class IslandMotion {
    readonly #panel: St.Bin;
    readonly #backdrop: St.Widget;
    readonly #pill: St.Widget;
    readonly #placement: IslandPlacement;
    readonly #dependencies: IslandMotionDependencies;
    readonly #disposables = new Disposables();
    #clipping = false;
    #recenterLater = 0;

    constructor(dependencies: IslandMotionDependencies) {
        const {panel, backdrop, pill} = dependencies;
        this.#panel = panel;
        this.#backdrop = backdrop;
        this.#pill = pill;
        this.#placement = dependencies.placement;
        this.#dependencies = dependencies;

        this.#disposables.signal(
            pill,
            pill.connect('notify::allocation', () => {
                this.#queueRecenter();
            }),
        );
        this.#disposables.add(() => {
            if (this.#recenterLater !== 0) global.compositor.get_laters().remove(this.#recenterLater);
            this.#recenterLater = 0;
        });
        this.#disposables.signal(
            backdrop,
            backdrop.connect('notify::allocation', () => {
                if (this.#clipping) this.#clipToBackdrop();
            }),
        );
        this.#disposables.signal(
            panel,
            panel.connect('notify::scale-x', () => {
                if (this.#clipping) this.#clipToBackdrop();
            }),
        );
        this.#disposables.signal(
            panel,
            panel.connect('notify::width', () => {
                this.#recenterPanel();
            }),
        );
        this.#disposables.signal(
            panel,
            panel.connect('notify::height', () => {
                if (this.#dependencies.isOpen() && (this.#placement.bottom || this.#placement.middle))
                    panel.y = this.#placement.panelY(panel.height);
            }),
        );
    }

    open(): void {
        const panel = this.#panel;
        const pill = this.#pill;
        const backdrop = this.#backdrop;
        const placement = this.#placement;
        const anchor = this.#dependencies.anchor();
        anchor.get_allocation_box();
        panel.remove_all_transitions();
        panel.remove_effect_by_name(BLUR);
        panel.opacity = 0;
        panel.show();

        const [anchorX, anchorY] = anchor.get_transformed_position();
        placement.anchorTo(anchorY, anchor.height);
        this.capHeight();
        const [, naturalWidth] = panel.get_preferred_width(-1);
        const max = placement.available();
        const [, naturalHeight] = panel.get_preferred_height(naturalWidth);
        const height = Math.min(naturalHeight, max);
        const x = placement.panelX(anchorX, anchor.width, naturalWidth);
        if (x !== null) panel.set_position(x, placement.panelY(height));
        panel.set_pivot_point((anchorX + anchor.width / 2 - panel.x) / Math.max(1, naturalWidth), placement.pivotY(panel.y, height));

        this.#pinBackdrop();
        if (!backdrop.visible) {
            backdrop.set_position(anchorX, anchorY);
            backdrop.set_size(anchor.width, anchor.height);
            backdrop.show();
        }
        panel.set_scale(CONTENT_OPEN_SCALE, CONTENT_OPEN_SCALE);
        this.#clipping = true;
        this.#clipToBackdrop();
        springEase(panel, {scaleX: 1, scaleY: 1}, SOFT_SPRING);
        springEase(backdrop, {x: panel.x, width: naturalWidth}, GENTLE_SPRING);
        springEase(backdrop, {y: panel.y, height}, springWithin(GENTLE_SPRING, backdrop.height, height, max), () => {
            this.#clipping = false;
            panel.remove_clip();
            backdrop.add_constraint_with_name(FOLLOW, new Clutter.BindConstraint({source: panel, coordinate: Clutter.BindCoordinate.ALL}));
        });
        panel.ease({opacity: 255, duration: CONTENT_FADE_IN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        pill.ease({opacity: 0, duration: FADE_OUT_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    close(): void {
        const panel = this.#panel;
        const pill = this.#pill;
        const backdrop = this.#backdrop;
        const anchor = this.#dependencies.anchor();
        anchor.get_allocation_box();
        const [anchorX, anchorY] = anchor.get_transformed_position();
        this.#pinBackdrop();
        panel.set_pivot_point(
            (anchorX + anchor.width / 2 - panel.x) / Math.max(1, panel.width),
            this.#placement.pivotY(panel.y, panel.height),
        );
        this.#clipping = true;
        this.#clipToBackdrop();
        this.#blurPanel(0, BLUR_RADIUS, CLOSE_FADE_MS);
        springEase(panel, {scaleX: CONTENT_CLOSE_SCALE, scaleY: CONTENT_CLOSE_SCALE}, SOFT_SPRING);
        panel.ease({opacity: 0, duration: CLOSE_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        springEase(backdrop, {x: anchorX, y: anchorY, width: anchor.width, height: anchor.height}, SOFT_SPRING, () => {
            backdrop.hide();
            panel.hide();
            panel.remove_clip();
            panel.remove_effect_by_name(BLUR);
            settle(panel);
            panel.opacity = 0;
            this.#clipping = false;
        });
        pill.ease({opacity: 255, duration: FADE_IN_MS, delay: SOFT_SPRING.ms - FADE_IN_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    snapClosed(): void {
        const panel = this.#panel;
        const pill = this.#pill;
        const backdrop = this.#backdrop;
        panel.remove_all_transitions();
        pill.remove_transition('opacity');
        backdrop.remove_all_transitions();
        backdrop.remove_constraint_by_name(FOLLOW);
        backdrop.hide();
        this.#clipping = false;
        panel.remove_clip();
        panel.remove_effect_by_name(BLUR);
        panel.set_scale(1, 1);
        panel.opacity = 0;
        panel.hide();
        pill.opacity = 255;
    }

    capHeight(): void {
        const available = this.#placement.available();
        const content = this.#panel.get_theme_node().adjust_for_height(available);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const height = Math.floor(content / scale);
        if (Number.isFinite(height)) this.#panel.style = `max-height: ${Math.max(0, height)}px;`;
    }

    destroy(): void {
        this.#disposables.dispose();
    }

    #blurPanel(from: number, to: number, duration: number): void {
        const panel = this.#panel;
        const current = panel.get_effect(BLUR);
        const effect = current instanceof Shell.BlurEffect ? current : new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR, brightness: 1});
        if (effect !== current) panel.add_effect_with_name(BLUR, effect);
        effect.radius = from;
        panel.ease_property(`@effects.${BLUR}.radius`, to, {
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (to === 0) panel.remove_effect_by_name(BLUR);
            },
        });
    }

    #pinBackdrop(): void {
        const backdrop = this.#backdrop;
        if (!backdrop.get_constraint(FOLLOW)) return;
        const {x, y, width, height} = this.#panel;
        backdrop.remove_constraint_by_name(FOLLOW);
        backdrop.set_position(x, y);
        backdrop.set_size(width, height);
    }

    #clipToBackdrop(): void {
        const panel = this.#panel;
        const backdrop = this.#backdrop;
        const [, preferred] = panel.get_preferred_width(-1);
        const width = Math.max(1, panel.allocation.get_width() || preferred);
        const scale = Math.max(0.01, panel.scale_x);
        const pivotX = panel.pivot_point.x * width;
        panel.set_clip(
            pivotX + (backdrop.x - panel.x - pivotX) / scale,
            (backdrop.y - panel.y) / scale,
            backdrop.width / scale,
            backdrop.height / scale,
        );
    }

    #queueRecenter(): void {
        if (!this.#dependencies.isOpen() || this.#recenterLater !== 0) return;
        this.#recenterLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this.#recenterLater = 0;
            this.#recenterPanel();
            return GLib.SOURCE_REMOVE;
        });
    }

    #recenterPanel(): void {
        if (!this.#dependencies.isOpen() || !this.#placement.monitor()) return;
        const anchor = this.#dependencies.anchor();
        const [anchorX] = anchor.get_transformed_position();
        const x = this.#placement.panelX(anchorX, anchor.width, this.#panel.width);
        if (x !== null) this.#panel.x = x;
    }
}
