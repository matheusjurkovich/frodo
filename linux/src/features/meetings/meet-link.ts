const MEET = /https:\/\/meet\.google\.com\/[a-z]+-[a-z]+-[a-z]+/i;

function unfold(text: string): string {
    return text.replace(/\r?\n[ \t]/g, '');
}

function unescapeText(value: string): string {
    return value.replace(/\\([\\;,nN])/g, (_match, char: string) => (char === 'n' || char === 'N' ? '\n' : char));
}

function valueStart(line: string): number {
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        if (char === '"') quoted = !quoted;
        else if (char === ':' && !quoted) return index;
    }
    return -1;
}

export function icalValue(ical: string, name: string): string | null {
    for (const line of unfold(ical).split(/\r?\n/)) {
        const colon = valueStart(line);
        if (colon < 0) continue;
        const key = line.slice(0, colon).split(';')[0]?.toUpperCase();
        if (key === name) return unescapeText(line.slice(colon + 1));
    }
    return null;
}

export function meetLink(ical: string): string | null {
    const conference = MEET.exec(icalValue(ical, 'X-GOOGLE-CONFERENCE') ?? '')?.[0];
    return conference ?? MEET.exec(unfold(ical))?.[0] ?? null;
}

export function meetLinkFor(objects: readonly string[], title: string): string | null {
    for (const ical of objects) {
        if (icalValue(ical, 'SUMMARY') !== title) continue;
        const link = meetLink(ical);
        if (link) return link;
    }
    return null;
}

export function isEnabledCalendar(data: string): boolean {
    let section = '';
    let calendar = false;
    let enabled = true;
    for (const line of data.split(/\r?\n/)) {
        const header = /^\[(.+)\]$/.exec(line.trim());
        if (header) {
            section = header[1] ?? '';
            if (section === 'Calendar') calendar = true;
            continue;
        }
        if (section === 'Data Source' && line.trim() === 'Enabled=false') enabled = false;
    }
    return calendar && enabled;
}

function utcStamp(ms: number): string {
    return new Date(ms)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
}

export function rangeQuery(startsAt: number, marginMs = 60e3): string {
    return `(occur-in-time-range? (make-time "${utcStamp(startsAt - marginMs)}") (make-time "${utcStamp(startsAt + marginMs)}"))`;
}
