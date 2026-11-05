export const WHOLE_DISK = /^(nvme\d+n\d+|sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+|mmcblk\d+)$/;

export const PROTECTED_NAMES: readonly string[] = [
    'gnome-shell',
    'Xwayland',
    'systemd',
    'gnome-session-binary',
    'gnome-session-service',
    'dbus-daemon',
    'dbus-broker',
    'pipewire',
    'pipewire-pulse',
    'wireplumber',
    'gdm-wayland-session',
];
