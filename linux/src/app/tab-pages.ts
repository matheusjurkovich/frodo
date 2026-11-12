import type {TabId} from '../settings/schema-values.types.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import {CalendarPage} from '../tabs/calendar/calendar-page.js';
import {ClaudePage} from '../tabs/claude/claude-page.js';
import {GeneralPage} from '../tabs/general/general-page.js';
import {MixerPage} from '../tabs/mixer/mixer-page.js';
import {NotificationsPage} from '../tabs/notifications/notifications-page.js';
import {PerformancePage} from '../tabs/performance/performance-page.js';
import {WorkspacesPage} from '../tabs/workspaces/workspaces-page.js';
import type {TabPagesDependencies} from './tab-pages.types.js';

export function createTabPages({
    island,
    actions,
    claude,
    transcripts,
    sessions,
    codex,
    gemini,
    settings,
    bridge,
    media,
    workspaces,
    performance,
    mixer,
}: TabPagesDependencies): ReadonlyMap<TabId, Component> {
    return new Map<TabId, Component>([
        ['general', new GeneralPage({island, settings, media, mixer, scrollToTop: actions.scrollToTop})],
        ['calendar', new CalendarPage(island)],
        ['workspaces', new WorkspacesPage(workspaces, island)],
        [
            'claude',
            new ClaudePage({
                claude,
                transcripts,
                sessions,
                codex,
                gemini,
                settings,
                actions: {
                    openSettings: actions.openSettings,
                    close: () => {
                        island.close();
                    },
                },
            }),
        ],
        ['notifications', new NotificationsPage(bridge, island)],
        ['performance', new PerformancePage(performance, island)],
        ['mixer', new MixerPage(mixer, island)],
    ]);
}
