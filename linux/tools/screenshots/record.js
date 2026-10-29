import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const [file, seconds, x, y, width, height] = ARGV;
const call = (method, parameters, type) =>
    Gio.DBus.session.call_sync(
        'org.gnome.Shell.Screencast',
        '/org/gnome/Shell/Screencast',
        'org.gnome.Shell.Screencast',
        method,
        parameters,
        new GLib.VariantType(type),
        Gio.DBusCallFlags.NONE,
        -1,
        null,
    );

const options = {framerate: new GLib.Variant('i', 30), 'draw-cursor': new GLib.Variant('b', false)};
call('ScreencastArea', new GLib.Variant('(iiiisa{sv})', [Number(x), Number(y), Number(width), Number(height), file, options]), '(bs)');
const loop = new GLib.MainLoop(null, false);
GLib.timeout_add(GLib.PRIORITY_DEFAULT, Number(seconds) * 1000, () => {
    call('StopScreencast', null, '(b)');
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
