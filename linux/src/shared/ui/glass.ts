import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Disposables} from '../disposables.js';
import {whileMapped} from './lifecycle.js';
import type {Component} from './lifecycle.types.js';
import type {Mirror} from './glass.types.js';
import {MASK_DECLARATIONS, MASK_CODE, MARGIN, BLUR_RADIUS, BRIGHTNESS} from './glass.const.js';

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
    readonly #live = new Disposables();
    readonly #mirrors = new Map<Clutter.Actor, Mirror>();

    constructor(host: St.Widget) {
        this.#host = host;
        const {actor} = this;
        actor.add_child(this.#scene);
        actor.add_effect(this.#mask);
        actor.add_effect(new Shell.BlurEffect({mode: Shell.BlurMode.ACTOR, radius: BLUR_RADIUS, brightness: BRIGHTNESS}));
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
        this.#disposables.add(
            whileMapped(
                actor,
                () => {
                    this.#startMirroring();
                },
                () => {
                    this.#stopMirroring();
                },
            ),
        );
        host.get_parent()?.insert_child_below(actor, host);
    }

    #startMirroring(): void {
        const sync = (): void => {
            this.#sync();
        };
        const windows = global.window_group;
        this.#live.signal(windows, windows.connect('child-added', sync));
        this.#live.signal(windows, windows.connect('child-removed', sync));
        this.#live.signal(global.display, global.display.connect('restacked', sync));
        this.#sync();
    }

    #stopMirroring(): void {
        this.#live.dispose();
        for (const source of [...this.#mirrors.keys()]) this.#drop(source);
    }

    #sync(): void {
        const sources = global.window_group.get_children();
        for (const source of [...this.#mirrors.keys()]) if (!sources.includes(source)) this.#drop(source);
        sources.forEach((source, index) => {
            const clone = this.#mirrors.get(source)?.clone ?? this.#mirror(source);
            if (this.#scene.get_child_at_index(index) !== clone) this.#scene.set_child_at_index(clone, index);
        });
    }

    #mirror(source: Clutter.Actor): Clutter.Clone {
        const clone = new Clutter.Clone({source});
        clone.add_constraint(new Clutter.BindConstraint({source, coordinate: Clutter.BindCoordinate.ALL}));
        const binding = source.bind_property('visible', clone, 'visible', GObject.BindingFlags.SYNC_CREATE);
        this.#mirrors.set(source, {clone, binding});
        this.#scene.add_child(clone);
        return clone;
    }

    #drop(source: Clutter.Actor): void {
        const mirror = this.#mirrors.get(source);
        if (!mirror) return;
        this.#mirrors.delete(source);
        mirror.binding.unbind();
        mirror.clone.destroy();
    }

    #reshape(): void {
        const host = this.#host;
        if (!host.mapped) return;
        const radius = host.get_theme_node().get_border_radius(St.Corner.TOPLEFT);
        this.#mask.shape(this.actor.width, this.actor.height, Math.min(radius, host.width / 2, host.height / 2));
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
