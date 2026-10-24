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
