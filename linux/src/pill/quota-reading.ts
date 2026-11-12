import {displayLevel, shownPercent} from '../features/claude/claude-usage.js';
import {meterLevel, shownMeterPercent} from '../shared/meter.js';
import {QUOTA_ITEMS} from './closed-items.const.js';
import type {QuotaItem} from './closed-items.types.js';
import type {QuotaSources, UsageReading} from './quota-reading.types.js';

export function quotaReading(item: QuotaItem, sources: QuotaSources, now: number): UsageReading | null {
    const {provider, key, suffix} = QUOTA_ITEMS[item];
    if (provider === 'claude') {
        const window = sources.claudeWindows.find(candidate => candidate.role === key);
        if (!window) return null;
        return {percent: shownPercent(window.utilization, sources.showRemaining), level: displayLevel(window, now), suffix};
    }
    if (!sources.providerEnabled(provider)) return null;
    const meter = sources[provider].meters(now).find(candidate => candidate.key === key);
    if (!meter) return null;
    return {percent: shownMeterPercent(meter.percent, sources.showRemaining), level: meterLevel(meter.percent), suffix};
}
