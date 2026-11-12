import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {formatClock, formatDate, percentLabel} from '../shared/format.js';
import {formatRam} from '../features/system/memory.js';
import type {ClosedItem} from '../settings/schema-values.types.js';
import {
    extensionIndicators,
    networkIndicator,
    onIndicatorsChanged,
    otherSystemIndicators,
    systemIndicator,
} from '../shared/shell-internals.js';
import {dimLabel, label} from '../shared/ui/layout.js';
import {frodoIcon} from '../shared/ui/icons.js';
import {QUOTA_ITEMS} from './closed-items.const.js';
import {isQuotaItem} from './closed-items.js';
import type {QuotaItem, TextItem} from './closed-items.types.js';
import type {Segment, SegmentContext} from './idle-view.types.js';
import {quotaReading} from './quota-reading.js';
import type {QuotaSources, UsageReading} from './quota-reading.types.js';
import {UsageSegment} from './usage-segment.js';

function present(actor: Clutter.Actor | null): Clutter.Actor[] {
    return actor ? [actor] : [];
}

function reading(item: QuotaItem, {settings, claude, codex, gemini}: SegmentContext): UsageReading | null {
    const sources: QuotaSources = {
        claudeWindows: claude.active?.windows ?? [],
        codex,
        gemini,
        providerEnabled: provider => settings.providerEnabled(provider),
        showRemaining: settings.claudeShowRemaining,
    };
    return quotaReading(item, sources, Date.now());
}

export function itemText(item: TextItem, context: SegmentContext): string {
    switch (item) {
        case 'battery': {
            const {battery} = context.state;
            return battery ? `Bat ${battery.percent}%` : 'Bat —';
        }
        case 'ram':
            return formatRam(context.state.memory, context.settings.ramPercent);
        default: {
            const {name, suffix} = QUOTA_ITEMS[item];
            const current = reading(item, context);
            return current ? `${name} ${percentLabel(current.percent)}${suffix}` : `${name} —`;
        }
    }
}

function clockSegment(): Segment {
    const clock = new St.Label({style_class: 'frodo-clock', y_align: Clutter.ActorAlign.CENTER});
    return {
        actor: clock,
        isVisible: () => true,
        update: () => {
            clock.text = formatClock();
        },
    };
}

function dateSegment(): Segment {
    const date = label('', 'frodo-pill-date');
    return {
        actor: date,
        isVisible: () => true,
        update: () => {
            date.text = formatDate(new Date());
        },
    };
}

function notificationsSegment({bridge}: SegmentContext): Segment {
    const box = new St.BoxLayout({style_class: 'frodo-pill-notifications', y_align: Clutter.ActorAlign.CENTER});
    const count = label('', 'frodo-pill-count');
    box.add_child(new St.Icon({gicon: frodoIcon('bell'), style_class: 'frodo-pill-status-icon'}));
    box.add_child(count);
    return {
        actor: box,
        isVisible: () => bridge.count > 0,
        update: () => {
            count.text = String(bridge.count);
        },
    };
}

function cloneSegment({built, refresh, rebuild}: SegmentContext, read: () => Clutter.Actor[]): Segment {
    const sources = read();
    const box = new St.BoxLayout({style_class: 'frodo-system-icons', y_align: Clutter.ActorAlign.CENTER});
    const clones = sources.map(source => new Clutter.Clone({source, y_align: Clutter.ActorAlign.CENTER}));
    for (const clone of clones) box.add_child(clone);
    for (const source of sources)
        for (const property of ['visible', 'width', 'height']) built.signal(source, source.connect(`notify::${property}`, refresh));
    built.add(
        onIndicatorsChanged(() => {
            const current = read();
            if (current.length !== sources.length || current.some((source, index) => source !== sources[index])) rebuild();
        }),
    );
    return {
        actor: box,
        isVisible: () => sources.some(source => source.visible),
        update: () => {
            clones.forEach((clone, index) => {
                const source = sources[index];
                clone.visible = source?.visible ?? false;
                if (source && source.width > 0 && source.height > 0) clone.set_size(source.width, source.height);
                else clone.set_size(-1, -1);
            });
        },
    };
}

function ramSegment(context: SegmentContext): Segment {
    const text = dimLabel();
    return {
        actor: text,
        isVisible: () => true,
        update: () => {
            text.text = itemText('ram', context);
        },
    };
}

function usageSegment(item: QuotaItem, context: SegmentContext): Segment {
    const {provider} = QUOTA_ITEMS[item];
    const usage = new UsageSegment(provider);
    return {
        actor: usage.actor,
        isVisible: () => provider === 'claude' || context.settings.providerEnabled(provider),
        update: () => {
            usage.setReading(reading(item, context));
        },
    };
}

export function createSegment(item: ClosedItem, context: SegmentContext): Segment {
    if (isQuotaItem(item)) return usageSegment(item, context);
    switch (item) {
        case 'clock':
            return clockSegment();
        case 'date':
            return dateSegment();
        case 'notifications':
            return notificationsSegment(context);
        case 'network':
            return cloneSegment(context, () => present(networkIndicator()));
        case 'bluetooth':
        case 'volume':
        case 'microphone':
        case 'do-not-disturb':
            return cloneSegment(context, () => present(systemIndicator(item)));
        case 'system':
            return cloneSegment(context, otherSystemIndicators);
        case 'extensions':
            return cloneSegment(context, extensionIndicators);
        case 'battery':
            return cloneSegment(context, () => present(systemIndicator('battery')));
        case 'ram':
            return ramSegment(context);
    }
}
