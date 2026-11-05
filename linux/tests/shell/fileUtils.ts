const INTERFACES: Record<string, string> = {
    'org.mpris.MediaPlayer2': `<interface name="org.mpris.MediaPlayer2">
        <property name="Identity" type="s" access="read"/>
    </interface>`,
    'org.mpris.MediaPlayer2.Player': `<interface name="org.mpris.MediaPlayer2.Player">
        <method name="PlayPause"/>
        <method name="Next"/>
        <method name="Previous"/>
        <property name="PlaybackStatus" type="s" access="read"/>
        <property name="Metadata" type="a{sv}" access="read"/>
        <property name="CanGoNext" type="b" access="read"/>
        <property name="CanGoPrevious" type="b" access="read"/>
        <property name="Position" type="x" access="read"/>
    </interface>`,
    'org.freedesktop.UPower.Device': `<interface name="org.freedesktop.UPower.Device">
        <property name="IsPresent" type="b" access="read"/>
        <property name="Percentage" type="d" access="read"/>
        <property name="State" type="u" access="read"/>
    </interface>`,
};

export function loadInterfaceXML(name: string): string {
    const xml = INTERFACES[name];
    if (xml === undefined) throw new Error(`interface ${name} sem XML no stub`);
    return `<node>${xml}</node>`;
}
