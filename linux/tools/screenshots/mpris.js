import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const XML = `<node>
<interface name="org.mpris.MediaPlayer2">
<property name="Identity" type="s" access="read"/><property name="DesktopEntry" type="s" access="read"/>
<property name="CanRaise" type="b" access="read"/><property name="CanQuit" type="b" access="read"/>
</interface>
<interface name="org.mpris.MediaPlayer2.Player">
<method name="PlayPause"/><method name="Play"/><method name="Pause"/><method name="Next"/><method name="Previous"/>
<property name="PlaybackStatus" type="s" access="read"/><property name="Metadata" type="a{sv}" access="read"/>
<property name="Position" type="x" access="read"/><property name="CanPlay" type="b" access="read"/>
<property name="CanPause" type="b" access="read"/><property name="CanGoNext" type="b" access="read"/>
<property name="CanGoPrevious" type="b" access="read"/><property name="CanSeek" type="b" access="read"/>
<property name="CanControl" type="b" access="read"/>
</interface>
</node>`;

const [cover] = ARGV;
const started = GLib.get_monotonic_time() - 83_000_000;
const yes = () => new GLib.Variant('b', true);
const no = () => new GLib.Variant('b', false);
const properties = {
    Identity: () => new GLib.Variant('s', 'Rhythmbox'),
    DesktopEntry: () => new GLib.Variant('s', 'org.gnome.Rhythmbox3'),
    CanRaise: no,
    CanQuit: no,
    PlaybackStatus: () => new GLib.Variant('s', 'Playing'),
    Position: () => new GLib.Variant('x', GLib.get_monotonic_time() - started),
    Metadata: () =>
        new GLib.Variant('a{sv}', {
            'mpris:trackid': new GLib.Variant('o', '/demo/1'),
            'mpris:length': new GLib.Variant('x', 214_000_000),
            'mpris:artUrl': new GLib.Variant('s', `file://${cover}`),
            'xesam:title': new GLib.Variant('s', 'Noites de Outubro'),
            'xesam:artist': new GLib.Variant('as', ['Banda Exemplo']),
            'xesam:album': new GLib.Variant('s', 'Álbum de Demonstração'),
        }),
    CanPlay: yes,
    CanPause: yes,
    CanGoNext: yes,
    CanGoPrevious: yes,
    CanControl: yes,
    CanSeek: no,
};

const info = Gio.DBusNodeInfo.new_for_xml(XML);
Gio.bus_own_name(
    Gio.BusType.SESSION,
    'org.mpris.MediaPlayer2.demo',
    Gio.BusNameOwnerFlags.NONE,
    connection => {
        for (const iface of info.interfaces)
            connection.register_object(
                '/org/mpris/MediaPlayer2',
                iface,
                (_connection, _sender, _path, _iface, _method, _parameters, invocation) => {
                    invocation.return_value(null);
                },
                (_connection, _sender, _path, _iface, name) => properties[name]?.() ?? null,
                null,
            );
    },
    null,
    null,
);
new GLib.MainLoop(null, false).run();
