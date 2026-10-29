import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

function find(test, actor = global.stage, mapped = true) {
    if ((actor.mapped || !mapped) && test(actor)) return actor;
    for (const child of actor.get_children()) {
        const found = find(test, child, mapped);
        if (found) return found;
    }
    return null;
}

const byClass = name => actor => actor.has_style_class_name?.(name);
const byName = name => actor => actor.accessible_name === name;

export default class Probe {
    enable() {
        global.context.unsafe_mode = true;
        const pointer = global.stage
            .get_context()
            .get_backend()
            .get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const move = (x, y) => {
            pointer.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
        };
        globalThis.probe = {
            away: () => {
                move(1000, 700);
            },
            hover: name => {
                const actor = find(byClass(name));
                const [x, y] = actor.get_transformed_position();
                move(x + actor.width / 2, y + actor.height / 2);
            },
            press: name => {
                find(byName(name)).emit('clicked', 1);
            },
            box: (name, margin) => {
                const actor = find(byClass(name));
                const [x, y] = actor.get_transformed_position();
                const top = Math.max(Math.round(y) - margin, Main.panel.height);
                return [
                    Math.round(x) - margin,
                    top,
                    Math.round(actor.width) + 2 * margin,
                    Math.round(y + actor.height) + margin - top,
                ].join(' ');
            },
            maskWifi: () => {
                const toggle = find(actor => actor.has_style_class_name?.('quick-toggle') && actor.title === 'Wi-Fi', global.stage, false);
                if (toggle) toggle.subtitle = 'Casa';
            },
            clearNotifications: () => {
                for (const source of Main.messageTray.getSources()) source.destroy();
            },
        };
    }

    disable() {
        delete globalThis.probe;
    }
}
