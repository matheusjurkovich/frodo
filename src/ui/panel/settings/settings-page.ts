import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {CheckBox} from 'resource:///org/gnome/shell/ui/checkBox.js';

import {isActiveProfile} from '../../../core/claude-profiles.js';
import {shortcutLabel} from '../../../core/shortcut.js';
import {TAB_LABELS, visibleTabs} from '../../../core/tabs.js';
import {TAB_IDS} from '../../../core/types.js';
import type {TabId} from '../../../core/types.js';
import {defaultConfigDir} from '../../../services/claude-client.js';
import type {FrodoSettings} from '../../../services/settings.js';
import {spawn} from '../../../shell/internals.js';
import {Disposables} from '../../../util/disposables.js';
import {backHeader, card, cardTitle} from '../../components/card.js';
import {textButton} from '../../components/buttons.js';
import {column, label, row, spacer} from '../../components/layout.js';
import type {Component} from '../../components/lifecycle.js';
import {frodoIcon} from '../../icons.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const SHOW_SECONDS_KEY = 'clock-show-seconds';

export interface SettingsActions {
    readonly back: () => void;
    readonly openPreferences: () => void;
    readonly close: () => void;
}

interface Binding {
    readonly box: CheckBox;
    readonly read: () => boolean;
}

function tile(child: Clutter.Actor, styleClass: string): St.Bin {
    child.set({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, x_expand: true, y_expand: true});
    return new St.Bin({style_class: `frodo-integration-icon ${styleClass}`, child, y_align: Clutter.ActorAlign.CENTER});
}

function integration(icon: St.Bin, title: string, subtitle: St.Widget, action: St.Button): St.BoxLayout {
    const item = row('frodo-integration');
    const text = column('frodo-integration-text');
    text.y_align = Clutter.ActorAlign.CENTER;
    text.add_child(label(title, 'frodo-integration-title'));
    text.add_child(subtitle);
    item.add_child(icon);
    item.add_child(text);
    item.add_child(action);
    return item;
}

export class SettingsPage implements Component {
    readonly actor = column('frodo-section');
    readonly #settings: FrodoSettings;
    readonly #interface = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    readonly #disposables = new Disposables();
    readonly #bindings: Binding[] = [];
    readonly #tabBoxes = new Map<TabId, CheckBox>();
    readonly #shortcut = label('', 'frodo-kbd frodo-mono');
    readonly #configDir = label('', 'frodo-integration-subtitle frodo-mono');

    constructor(settings: FrodoSettings, actions: SettingsActions) {
        this.#settings = settings;

        const columns = row('frodo-settings-columns');
        columns.layout_manager.homogeneous = true;
        columns.add_child(this.#behavior());
        columns.add_child(this.#tabs());
        this.actor.add_child(backHeader('Configurações da ilha', actions.back));
        this.actor.add_child(columns);
        this.actor.add_child(this.#integrations(actions));

        const sync = (): void => {
            this.#sync();
        };
        this.#disposables.add(
            settings.onChanged(['open-on-hover', 'auto-close', 'toggle-shortcut', 'hidden-tabs', 'claude-profiles'], sync),
        );
        const secondsId = this.#interface.connect(`changed::${SHOW_SECONDS_KEY}`, sync);
        this.#disposables.add(() => {
            this.#interface.disconnect(secondsId);
        });
        this.#sync();
    }

    #check(text: string, read: () => boolean, write: (checked: boolean) => void): CheckBox {
        const box = new CheckBox(text);
        box.add_style_class_name('frodo-check');
        box.connect('notify::checked', () => {
            if (box.checked !== read()) write(box.checked);
        });
        this.#bindings.push({box, read});
        return box;
    }

    #behavior(): St.BoxLayout {
        const settings = this.#settings;
        const shortcut = row('frodo-settings-row');
        shortcut.add_child(label('Atalho para abrir', 'frodo-settings-text'));
        shortcut.add_child(spacer());
        shortcut.add_child(this.#shortcut);

        const behavior = card();
        behavior.add_child(cardTitle('Comportamento'));
        behavior.add_child(
            this.#check(
                'Expandir ao passar o mouse',
                () => settings.openOnHover,
                checked => {
                    settings.openOnHover = checked;
                },
            ),
        );
        behavior.add_child(
            this.#check(
                'Recolher sozinha após 5 s sem uso',
                () => settings.autoClose,
                checked => {
                    settings.autoClose = checked;
                },
            ),
        );
        behavior.add_child(
            this.#check(
                'Mostrar segundos no relógio',
                () => this.#interface.get_boolean(SHOW_SECONDS_KEY),
                checked => {
                    this.#interface.set_boolean(SHOW_SECONDS_KEY, checked);
                },
            ),
        );
        behavior.add_child(shortcut);
        return behavior;
    }

    #tabs(): St.BoxLayout {
        const settings = this.#settings;
        const tabs = card();
        tabs.add_child(cardTitle('Abas visíveis'));
        for (const id of TAB_IDS) {
            const box = this.#check(
                TAB_LABELS[id],
                () => visibleTabs(settings.hiddenTabs).includes(id),
                checked => {
                    const visible = visibleTabs(settings.hiddenTabs).filter(tab => tab !== id);
                    if (checked) visible.push(id);
                    settings.hiddenTabs = TAB_IDS.filter(tab => !visible.includes(tab));
                },
            );
            this.#tabBoxes.set(id, box);
            tabs.add_child(box);
        }
        return tabs;
    }

    #integrations(actions: SettingsActions): St.BoxLayout {
        const integrations = card();
        integrations.add_child(cardTitle('Integrações'));

        integrations.add_child(
            integration(
                tile(label('GA', 'frodo-integration-initials'), 'frodo-integration-google'),
                'Google Agenda',
                label('Pelas Contas Online do GNOME', 'frodo-integration-subtitle'),
                textButton('Abrir', () => {
                    actions.close();
                    spawn(['gnome-control-center', 'online-accounts']);
                }),
            ),
        );

        const usage = row('frodo-integration-usage');
        usage.add_child(label('Lendo uso de ', 'frodo-integration-subtitle'));
        usage.add_child(this.#configDir);
        integrations.add_child(
            integration(
                tile(new St.Icon({gicon: frodoIcon('claude'), icon_size: 18}), 'frodo-integration-claude'),
                'Claude Code',
                usage,
                textButton('Mais opções', actions.openPreferences),
            ),
        );
        return integrations;
    }

    #sync(): void {
        const visible = visibleTabs(this.#settings.hiddenTabs);
        for (const {box, read} of this.#bindings) box.checked = read();
        for (const [id, box] of this.#tabBoxes) {
            const locked = visible.length === 1 && visible.includes(id);
            box.reactive = !locked;
            box.can_focus = !locked;
        }
        this.#shortcut.text = shortcutLabel(this.#settings.toggleShortcut);
        this.#shortcut.visible = this.#shortcut.text !== '';
        const profiles = this.#settings.claudeProfiles;
        const defaultDir = defaultConfigDir();
        this.#configDir.text = (profiles.find(profile => isActiveProfile(profile, defaultDir)) ?? profiles[0])?.configDir ?? defaultDir;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
