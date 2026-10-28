import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Disposables} from '../disposables.js';
import type {Component} from './lifecycle.js';

const BLUR_RADIUS = 40;
const MARGIN = BLUR_RADIUS;

const MASK_DECLARATIONS = `
uniform vec2 size;
uniform float margin;
uniform float radius;
`;

const MASK_CODE = `
vec2 point = abs(cogl_tex_coord_in[0].xy * size - size * 0.5) - (size * 0.5 - vec2(margin)) + vec2(radius);
float distance = length(max(point, vec2(0.0))) + min(max(point.x, point.y), 0.0) - radius;
cogl_color_out *= 1.0 - smoothstep(-0.5, 0.5, distance);
`;

const RoundedMask = GObject.registerClass(
    class RoundedMask extends Shell.GLSLEffect {
        override vfunc_build_pipeline(): void {
            this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, MASK_DECLARATIONS, MASK_CODE, false);
        }

        shape(width: number, height: number, radius: number): void {
            this.set_uniform_float(this.get_uniform_location('size'), 2, [width, height]);
            this.set_uniform_float(this.get_uniform_location('margin'), 1, [MARGIN]);
            this.set_uniform_float(this.get_uniform_location('radius'), 1, [radius]);
            this.queue_repaint();
        }
    },
);

const Backdrop = GObject.registerClass(
    class Backdrop extends Clutter.Actor {
        override vfunc_allocate(box: Clutter.ActorBox): void {
            this.set_allocation(box);
            const {width, height} = global.stage;
            this.get_first_child()?.allocate(new Clutter.ActorBox({x1: -box.x1, y1: -box.y1, x2: width - box.x1, y2: height - box.y1}));
        }
    },
);

export class Glass implements Component {
    readonly actor = new Backdrop({reactive: false, clip_to_allocation: true});
    readonly #host: St.Widget;
    readonly #scene = new Clutter.Actor();
    readonly #mask = new RoundedMask();
    readonly #disposables = new Disposables();
    #mirrors: GObject.Binding[] = [];

    constructor(host: St.Widget) {
        this.#host = host;
        const {actor} = this;
        actor.add_child(this.#scene);
        actor.add_effect(this.#mask);
        actor.add_effect(new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR, radius: BLUR_RADIUS, brightness: 1}));
        actor.add_constraint(new Clutter.BindConstraint({source: host, coordinate: Clutter.BindCoordinate.POSITION, offset: -MARGIN}));
        actor.add_constraint(new Clutter.BindConstraint({source: host, coordinate: Clutter.BindCoordinate.SIZE, offset: 2 * MARGIN}));
        for (const property of ['visible', 'opacity']) {
            const binding = host.bind_property(property, actor, property, GObject.BindingFlags.SYNC_CREATE);
            this.#disposables.add(() => {
                binding.unbind();
            });
        }
        const reshape = (): void => {
            this.#reshape();
        };
        this.#disposables.signal(actor, actor.connect('notify::allocation', reshape));
        this.#disposables.signal(host, host.connect('style-changed', reshape));
        const mirror = (): void => {
            this.#mirror();
        };
        const windows = global.window_group;
        this.#disposables.signal(windows, windows.connect('child-added', mirror));
        this.#disposables.signal(windows, windows.connect('child-removed', mirror));
        this.#disposables.signal(global.display, global.display.connect('restacked', mirror));
        this.#disposables.add(() => {
            this.#unmirror();
        });
        this.#mirror();
        host.get_parent()?.insert_child_below(actor, host);
    }

    #mirror(): void {
        this.#unmirror();
        for (const source of global.window_group.get_children()) {
            const clone = new Clutter.Clone({source});
            clone.add_constraint(new Clutter.BindConstraint({source, coordinate: Clutter.BindCoordinate.ALL}));
            this.#mirrors.push(source.bind_property('visible', clone, 'visible', GObject.BindingFlags.SYNC_CREATE));
            this.#scene.add_child(clone);
        }
    }

    #unmirror(): void {
        for (const binding of this.#mirrors) binding.unbind();
        this.#mirrors = [];
        this.#scene.destroy_all_children();
    }

    #reshape(): void {
        const host = this.#host;
        if (!host.mapped) return;
        const node = host.get_theme_node();
        const radius = Math.max(
            ...[St.Corner.TOPLEFT, St.Corner.TOPRIGHT, St.Corner.BOTTOMRIGHT, St.Corner.BOTTOMLEFT].map(corner =>
                node.get_border_radius(corner),
            ),
        );
        this.#mask.shape(this.actor.width, this.actor.height, Math.min(radius, host.width / 2, host.height / 2));
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
