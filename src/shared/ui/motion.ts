import Clutter from 'gi://Clutter';

import {SOFT_SPRING, springProgress} from '../spring.js';
import type {Spring} from '../spring.js';

const FADE_OUT_MS = 110;
const FADE_OUT_SCALE = 0.96;
const FADE_IN_MS = 220;
const FADE_IN_DELAY_MS = 70;
const FADE_IN_SCALE = 0.92;
const ZOOM_DELAY_MS = 40;

type Axis = 'width' | 'height';

export interface Axes {
    readonly width: boolean;
    readonly height: boolean;
}

export const BOTH_AXES: Axes = {width: true, height: true};
export const WIDTH_AXIS: Axes = {width: true, height: false};
export const HEIGHT_AXIS: Axes = {width: false, height: true};

type EaseParams = Parameters<Clutter.Actor['ease']>[0];

export type SpringProps = Omit<EaseParams, 'duration' | 'mode' | 'onComplete' | 'onStopped'>;

function snakeCase(name: string): string {
    return name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function springEase(actor: Clutter.Actor, props: SpringProps, spring: Spring, onComplete?: () => void): void {
    const params: Record<string, unknown> = {};
    const names: string[] = [];
    for (const [key, value] of Object.entries(props)) {
        if (key === 'delay') {
            params[key] = value;
            continue;
        }
        const name = snakeCase(key);
        params[name] = value;
        names.push(name.replaceAll('_', '-'));
    }
    actor.ease({...params, duration: spring.ms, mode: Clutter.AnimationMode.LINEAR, onComplete});
    for (const name of names)
        actor
            .get_transition(name)
            ?.set_progress_func((_timeline, elapsed, total) => springProgress(spring.damping, total > 0 ? elapsed / total : 1));
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
    const from = animate ? {width: actor.width, height: actor.height} : {width: 0, height: 0};
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
