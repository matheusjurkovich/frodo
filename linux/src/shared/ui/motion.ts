import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {FIRM_SPRING, SOFT_SPRING, SPRING, springProgress} from '../spring.js';
import type {Spring} from '../spring.js';

const FADE_OUT_MS = 110;
const FADE_OUT_SCALE = 0.96;
const FADE_IN_MS = 220;
const FADE_IN_DELAY_MS = 70;
const FADE_IN_SCALE = 0.92;
const ZOOM_DELAY_MS = 40;
const SLIDE_PX = 56;
const SLIDE_FADE_MS = 220;
const REVEAL_IN_MS = 240;
const REVEAL_IN_DELAY_MS = 80;
const REVEAL_OUT_MS = 120;

type Axis = 'width' | 'height';

export interface Axes {
    readonly width: boolean;
    readonly height: boolean;
}

export const BOTH_AXES: Axes = {width: true, height: true};
export const WIDTH_AXIS: Axes = {width: true, height: false};
export const HEIGHT_AXIS: Axes = {width: false, height: true};

const SPRING_KEYS = 24;
const DOUBLE_PROPERTIES = new Set(['scale-x', 'scale-y', 'rotation-angle-z']);

type EaseParams = Parameters<Clutter.Actor['ease']>[0];

export type SpringProps = Omit<EaseParams, 'duration' | 'mode' | 'onComplete' | 'onStopped'>;

function snakeCase(name: string): string {
    return name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function typedValue(property: string, value: number): GObject.Value {
    const typed = new GObject.Value();
    if (DOUBLE_PROPERTIES.has(property)) {
        typed.init(GObject.TYPE_DOUBLE);
        typed.set_double(value);
    } else {
        typed.init(GObject.TYPE_FLOAT);
        typed.set_float(value);
    }
    return typed;
}

export function springEase(actor: Clutter.Actor, props: SpringProps, spring: Spring, onComplete?: () => void): void {
    const settings = St.Settings.get();
    const scale = settings.enable_animations ? settings.slow_down_factor : 0;
    const duration = Math.round(spring.ms * scale);
    const delay = Math.round((props.delay ?? 0) * scale);
    const fields = actor as unknown as Record<string, number>;
    const targets = Object.entries(props)
        .filter((entry): entry is [string, number] => entry[0] !== 'delay' && typeof entry[1] === 'number')
        .map(([key, to]) => ({field: snakeCase(key), property: snakeCase(key).replaceAll('_', '-'), to}));
    for (const {property} of targets) actor.remove_transition(property);
    if (duration <= 0 || !actor.mapped) {
        for (const {field, to} of targets) fields[field] = to;
        onComplete?.();
        return;
    }
    const times = Array.from({length: SPRING_KEYS - 1}, (_, index) => (index + 1) / SPRING_KEYS);
    let remaining = targets.length;
    let interrupted = false;
    for (const {field, property, to} of targets) {
        const from = fields[field] ?? 0;
        const transition = new Clutter.KeyframeTransition({
            property_name: property,
            duration,
            delay,
            progress_mode: Clutter.AnimationMode.LINEAR,
            remove_on_complete: true,
        });
        transition.set_from(typedValue(property, from));
        transition.set_to(typedValue(property, to));
        transition.set_key_frames(times);
        transition.set_values(times.map(time => typedValue(property, from + (to - from) * springProgress(spring.damping, time))));
        transition.set_modes(times.map(() => Clutter.AnimationMode.LINEAR));
        transition.connect('stopped', (_transition, finished) => {
            if (!finished) interrupted = true;
            remaining--;
            if (remaining === 0 && !interrupted) onComplete?.();
        });
        actor.add_transition(property, transition);
    }
    if (targets.length === 0) onComplete?.();
}

function axesOf(axes: Axes): Axis[] {
    return (['width', 'height'] as const).filter(axis => axes[axis]);
}

function setAxis(actor: Clutter.Actor, axis: Axis, value: number): void {
    if (axis === 'width') actor.width = value;
    else actor.height = value;
}

export function morphSize(actor: Clutter.Actor, change: () => void, spring: Spring, axes: Axes = BOTH_AXES): void {
    const animate = actor.mapped;
    const box = actor.allocation;
    const from = animate ? {width: box.get_width(), height: box.get_height()} : {width: 0, height: 0};
    const listed = axesOf(axes);
    for (const axis of listed) {
        actor.remove_transition(axis);
        setAxis(actor, axis, -1);
    }
    change();
    if (!animate) return;
    const [, width] = actor.get_preferred_width(-1);
    const [, height] = actor.get_preferred_height(axes.width ? width : from.width);
    const target = {width, height};
    const changed = listed.filter(axis => Math.round(from[axis]) !== Math.round(target[axis]));
    if (changed.length === 0) return;
    const props: SpringProps = {};
    for (const axis of changed) {
        setAxis(actor, axis, from[axis]);
        props[axis] = target[axis];
    }
    springEase(actor, props, spring, () => {
        for (const axis of changed) setAxis(actor, axis, -1);
    });
}

export function settle(actor: Clutter.Actor): void {
    actor.remove_all_transitions();
    actor.set({opacity: 255, translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1});
}

export function fadeOut(actor: Clutter.Actor, onGone: () => void): void {
    if (!actor.mapped) {
        onGone();
        return;
    }
    actor.remove_all_transitions();
    actor.set_pivot_point(0.5, 0.5);
    actor.ease({
        opacity: 0,
        scaleX: FADE_OUT_SCALE,
        scaleY: FADE_OUT_SCALE,
        duration: FADE_OUT_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: onGone,
    });
}

export function fadeIn(actor: Clutter.Actor): void {
    if (!actor.mapped) {
        settle(actor);
        return;
    }
    actor.remove_all_transitions();
    actor.set_pivot_point(0.5, 0.5);
    actor.set({opacity: 0, scale_x: FADE_IN_SCALE, scale_y: FADE_IN_SCALE});
    actor.ease({opacity: 255, duration: FADE_IN_MS, delay: FADE_IN_DELAY_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    springEase(actor, {scaleX: 1, scaleY: 1, delay: ZOOM_DELAY_MS}, SOFT_SPRING);
}

export function slideOut(actor: Clutter.Actor, direction: 1 | -1, onGone: () => void): void {
    if (!actor.mapped) {
        onGone();
        return;
    }
    springEase(actor, {translationX: -direction * SLIDE_PX}, SPRING);
    actor.ease({opacity: 0, duration: SLIDE_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD, onComplete: onGone});
}

export function slideIn(actor: Clutter.Actor, direction: 1 | -1): void {
    if (!actor.mapped) {
        settle(actor);
        return;
    }
    actor.remove_all_transitions();
    actor.set({translation_x: direction * SLIDE_PX, opacity: 0});
    springEase(actor, {translationX: 0}, SPRING);
    actor.ease({opacity: 255, duration: SLIDE_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
}

export function reveal(actor: Clutter.Actor, show: boolean, onDone?: () => void): void {
    const growing = actor.get_transition('height') !== null;
    if (show ? actor.visible && !growing : !actor.visible) {
        onDone?.();
        return;
    }
    const from = actor.visible ? actor.allocation.get_height() : 0;
    actor.remove_transition('height');
    if (!show) {
        if (!actor.mapped) {
            actor.hide();
            actor.set({height: -1, clip_to_allocation: false, opacity: 255});
            onDone?.();
            return;
        }
        actor.set({height: from, clip_to_allocation: true});
        springEase(actor, {height: 0}, FIRM_SPRING, () => {
            actor.hide();
            actor.set({height: -1, clip_to_allocation: false, opacity: 255});
            onDone?.();
        });
        actor.ease({opacity: 0, duration: REVEAL_OUT_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        return;
    }
    const hidden = !actor.visible;
    actor.height = -1;
    actor.show();
    if (!actor.mapped) {
        settle(actor);
        actor.clip_to_allocation = false;
        onDone?.();
        return;
    }
    const width = actor.allocation.get_width();
    const [, to] = actor.get_preferred_height(width > 0 ? width : (actor.get_parent()?.allocation.get_width() ?? -1));
    actor.set({height: from, clip_to_allocation: true});
    if (hidden) actor.opacity = 0;
    springEase(actor, {height: to}, SPRING, () => {
        actor.set({height: -1, clip_to_allocation: false});
        onDone?.();
    });
    actor.ease({opacity: 255, duration: REVEAL_IN_MS, delay: REVEAL_IN_DELAY_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
}
