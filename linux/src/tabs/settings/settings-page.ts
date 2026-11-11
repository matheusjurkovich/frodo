import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Disposables} from '../../shared/disposables.js';
import {backHeader} from '../../shared/ui/card.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {contentButton} from '../../shared/ui/buttons.js';
import {column, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {swap} from '../../shared/ui/motion.js';
import {AgendaSection} from './agenda-section.js';
import {AiSection} from './ai-section.js';
import {GeneralSection} from './general-section.js';
import {PillSection} from './pill-section.js';
import {ScreenSection} from './screen-section.js';
import type {SettingsSection} from './settings-rows.types.js';
import {TabsSection} from './tabs-section.js';
import {INTERFACE_SCHEMA, SECTIONS} from './settings-page.const.js';
import type {SectionId, SettingsActions} from './settings-page.types.js';

export class SettingsPage implements Component {
    readonly actor = column('frodo-section');
    readonly #interface = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    readonly #disposables = new Disposables();
    readonly #nav = new Map<SectionId, St.Button>();
    readonly #sections = new Map<SectionId, SettingsSection>();
    readonly #content = column('frodo-settings-content');
    readonly #builders: Record<SectionId, () => SettingsSection>;
    #section: SectionId = 'general';

    constructor(settings: FrodoSettings, sessions: ClaudeSessions, preview: Clutter.Actor, actions: SettingsActions) {
        const grabKeyboard = (focus: Clutter.Actor): void => {
            actions.grabKeyboard(focus);
        };
        const interfaceSettings = this.#interface;
        this.#builders = {
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
            const button = contentButton(
                'frodo-settings-nav-item',
                item,
                () => {
                    this.#show(id);
                },
                {accessible_name: text},
            );
            this.#nav.set(id, button);
            nav.add_child(button);
        }
        body.add_child(nav);
        body.add_child(content);
        this.actor.add_child(body);

        this.#show(this.#section);
    }

    #show(id: SectionId): void {
        const order = (section: SectionId): number => SECTIONS.findIndex(entry => entry.id === section);
        const direction = order(id) > order(this.#section) ? 1 : -1;
        const changed = id !== this.#section;
        this.#section = id;
        for (const [other, button] of this.#nav) button.checked = other === id;
        if (!this.#sections.has(id)) {
            const section = this.#disposables.own(this.#builders[id]());
            this.#sections.set(id, section);
            section.actor.visible = false;
            this.#content.add_child(section.actor);
        }
        const apply = (): void => {
            for (const [other, section] of this.#sections) section.actor.visible = other === id;
        };
        if (changed) swap(this.#content, direction, apply, 'y');
        else apply();
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
