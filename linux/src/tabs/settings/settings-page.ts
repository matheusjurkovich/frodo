import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Disposables} from '../../shared/disposables.js';
import {backHeader} from '../../shared/ui/card.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {swap} from '../../shared/ui/motion.js';
import {AgendaSection} from './agenda-section.js';
import {AiSection} from './ai-section.js';
import {GeneralSection} from './general-section.js';
import {PillSection} from './pill-section.js';
import {ScreenSection} from './screen-section.js';
import {BATTERY_PERCENT_KEY, SHOW_SECONDS_KEY} from './settings-rows.const.js';
import type {SettingsSection} from './settings-rows.types.js';
import {TabsSection} from './tabs-section.js';
import {INTERFACE_SCHEMA, SYNC_KEYS, SECTIONS} from './settings-page.const.js';
import type {SectionId, SettingsActions} from './settings-page.types.js';

export class SettingsPage implements Component {
    readonly actor = column('frodo-section');
    readonly #interface = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    readonly #disposables = new Disposables();
    readonly #nav = new Map<SectionId, St.Button>();
    readonly #sections = new Map<SectionId, SettingsSection>();
    readonly #content = column('frodo-settings-content');
    #section: SectionId = 'general';

    constructor(settings: FrodoSettings, sessions: ClaudeSessions, preview: Clutter.Actor, actions: SettingsActions) {
        const sync = (): void => {
            this.#sync();
        };
        this.#disposables.add(settings.onChanged(SYNC_KEYS, sync));

        const grabKeyboard = (focus: Clutter.Actor): void => {
            actions.grabKeyboard(focus);
        };
        const interfaceSettings = this.#interface;
        const builders: Record<SectionId, () => SettingsSection> = {
            general: () => new GeneralSection({settings, interfaceSettings, grabKeyboard}),
            screen: () => new ScreenSection({settings}),
            pill: () => new PillSection({settings, interfaceSettings, preview, overlay: actions.overlay}),
            tabs: () => new TabsSection({settings, overlay: actions.overlay}),
            ai: () => new AiSection({settings, sessions, grabKeyboard}),
            agenda: () => new AgendaSection({settings, close: actions.close}),
        };

        this.actor.add_child(backHeader('Configurações', actions.back));
        const body = row('frodo-settings-body');
        const nav = column('frodo-settings-nav');
        nav.x_expand = false;
        nav.y_align = Clutter.ActorAlign.START;
        const content = this.#content;
        content.x_expand = true;
        for (const {id, label: text, icon} of SECTIONS) {
            const item = row('frodo-settings-nav-content');
            item.add_child(new St.Icon({gicon: frodoIcon(icon), style_class: 'frodo-settings-nav-icon'}));
            item.add_child(label(text, 'frodo-settings-nav-label'));
            const button = new St.Button({style_class: 'frodo-settings-nav-item', child: item, can_focus: true, accessible_name: text});
            button.connect('clicked', () => {
                this.#show(id);
            });
            this.#nav.set(id, button);
            nav.add_child(button);
            const section = this.#disposables.own(builders[id]());
            this.#sections.set(id, section);
            content.add_child(section.actor);
        }
        body.add_child(nav);
        body.add_child(content);
        this.actor.add_child(body);

        for (const key of [SHOW_SECONDS_KEY, BATTERY_PERCENT_KEY])
            this.#disposables.signal(this.#interface, this.#interface.connect(`changed::${key}`, sync));
        this.#show(this.#section);
        this.#sync();
    }

    #show(id: SectionId): void {
        const order = (section: SectionId): number => SECTIONS.findIndex(entry => entry.id === section);
        const direction = order(id) > order(this.#section) ? 1 : -1;
        const changed = id !== this.#section;
        this.#section = id;
        for (const [other, button] of this.#nav) button.checked = other === id;
        const apply = (): void => {
            for (const [other, section] of this.#sections) section.actor.visible = other === id;
        };
        if (changed) swap(this.#content, direction, apply, 'y');
        else apply();
    }

    #sync(): void {
        for (const section of this.#sections.values()) section.sync?.();
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
