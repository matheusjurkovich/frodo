import Gio from 'gi://Gio';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

export function parseMeminfo(text) {
    const total = /^MemTotal:\s+(\d+)/m.exec(text);
    const available = /^MemAvailable:\s+(\d+)/m.exec(text);
    if (!total || !available)
        return null;
    const totalKb = Number(total[1]);
    return {totalKb, usedKb: totalKb - Number(available[1])};
}

export function formatGb(kb) {
    return `${(kb / 1048576).toFixed(1)}G`;
}

export async function readMemory() {
    try {
        const [bytes] = await Gio.File.new_for_path('/proc/meminfo').load_contents_async(null);
        return parseMeminfo(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}
