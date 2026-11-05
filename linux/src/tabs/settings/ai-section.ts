import GLib from 'gi://GLib';
import St from 'gi://St';
import type {HookedAgent} from '../../features/claude/agent-hooks.types.js';
import {defaultConfigDir} from '../../features/claude/claude-client.js';
import {isActiveProfile} from '../../features/claude/claude-profiles.js';
import {profileFor} from '../../features/claude/claude-profiles-service.js';
import {expandHome} from '../../settings/claude-profile.js';
import type {ClaudeProfile} from '../../settings/claude-profile.types.js';
import type {AiProvider} from '../../settings/schema-values.js';
import {Disposables} from '../../shared/disposables.js';
import {chip, iconButton, textButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, dimLabel, label, row} from '../../shared/ui/layout.js';
import {providerTile} from '../../shared/ui/provider-tile.js';
import {Bindings, group, line, wrapped} from './settings-rows.js';
import type {SettingsSection} from './settings-rows.types.js';
import {POLL_MINUTES, GEMINI_LIMITS, HOOK_PATHS} from './ai-section.const.js';
import type {AiSectionDependencies} from './ai-section.types.js';

function homePath(path: string): string {
    const home = GLib.get_home_dir();
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export class AiSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #deps: AiSectionDependencies;
    readonly #disposables = new Disposables();
    readonly #bindings = new Bindings(this.#disposables);
    readonly #profiles = column('frodo-settings-profiles');
    readonly #newProfile = new St.Entry({style_class: 'frodo-entry', hint_text: '~/.claude-trabalho', can_focus: true, x_expand: true});
    #destroyed = false;

    constructor(deps: AiSectionDependencies) {
        this.#deps = deps;
        this.#typing(this.#newProfile);
        this.actor.add_child(this.#usage());
        this.actor.add_child(this.#claude());
        this.actor.add_child(this.#codex());
        this.actor.add_child(this.#gemini());
        this.#disposables.add(
            deps.settings.onChanged('claude-profiles', () => {
                this.#renderProfiles();
            }),
        );
        this.#renderProfiles();
    }

    sync(): void {
        this.#bindings.sync();
    }

    #typing(entry: St.Entry): void {
        entry.clutter_text.connect('key-focus-in', () => {
            this.#deps.grabKeyboard(entry.clutter_text);
        });
    }

    #usage(): St.BoxLayout {
        const settings = this.#deps.settings;
        return group('Uso', [
            line(
                'Atualizar uso a cada',
                null,
                this.#bindings.stepper(
                    POLL_MINUTES,
                    'min',
                    () => settings.claudePollMinutes,
                    value => {
                        settings.claudePollMinutes = value;
                    },
                ),
            ),
            line(
                'Avisar quando terminar',
                'Notificação quando Claude, Codex ou Gemini termina a resposta',
                this.#bindings.switch(
                    'Avisar quando terminar',
                    () => settings.notifyDone,
                    checked => {
                        settings.notifyDone = checked;
                    },
                ),
            ),
            line(
                'Avisar cota em 80% e 95%',
                'E quando a cota renova',
                this.#bindings.switch(
                    'Avisar cota em 80% e 95%',
                    () => settings.notifyQuota,
                    checked => {
                        settings.notifyQuota = checked;
                    },
                ),
            ),
            line(
                'Mostrar uso restante em vez do usado',
                null,
                this.#bindings.switch(
                    'Mostrar uso restante em vez do usado',
                    () => settings.claudeShowRemaining,
                    checked => {
                        settings.claudeShowRemaining = checked;
                    },
                ),
            ),
        ]);
    }

    #follow(provider: AiProvider, title: string, subtitle: string): St.BoxLayout {
        const settings = this.#deps.settings;
        const item = line(
            label(title, 'frodo-settings-text frodo-settings-line-strong'),
            subtitle,
            this.#bindings.switch(
                title,
                () => settings.providerEnabled(provider),
                checked => {
                    settings.setProviderEnabled(provider, checked);
                },
            ),
        );
        item.insert_child_at_index(providerTile(provider, 32), 0);
        return item;
    }

    #claude(): St.BoxLayout {
        const add = (): void => {
            this.#addProfile();
        };
        this.#newProfile.clutter_text.connect('activate', add);
        const adder = row('frodo-settings-row');
        adder.add_child(this.#newProfile);
        adder.add_child(textButton('Adicionar perfil', add, 'control', frodoIcon('plus')));
        const profiles = column('frodo-settings-line frodo-settings-stack');
        profiles.add_child(label('Perfis', 'frodo-settings-text'));
        profiles.add_child(this.#profiles);
        profiles.add_child(adder);
        return group('Claude Code', [
            this.#follow('claude', 'Acompanhar o Claude Code', 'Cotas pela conta, sessões pelo hook em ~/.claude/settings.json'),
            profiles,
        ]);
    }

    #codex(): St.BoxLayout {
        return group('Codex', [
            this.#follow('codex', 'Acompanhar o Codex', 'Cotas e consumo lidos de ~/.codex/sessions'),
            this.#hookLine('codex', 'Sessões e permissões', 'Mostra o status e deixa aprovar ou negar pedidos pela ilha'),
        ]);
    }

    #gemini(): St.BoxLayout {
        const settings = this.#deps.settings;
        return group('Gemini CLI', [
            this.#follow('gemini', 'Acompanhar o Gemini CLI', 'Tokens e sessões lidos de ~/.gemini/tmp'),
            line(
                'Limite diário de pedidos',
                'O Gemini CLI não informa a cota; a ilha conta os pedidos do dia',
                this.#bindings.segmented(
                    GEMINI_LIMITS,
                    () => String(settings.geminiDailyLimit),
                    value => {
                        settings.geminiDailyLimit = Number(value);
                    },
                ),
            ),
            this.#hookLine(
                'gemini',
                'Status das sessões',
                'O Gemini CLI não deixa responder pedidos por hook: a ilha avisa e abre o terminal',
            ),
        ]);
    }

    #hookLine(agent: HookedAgent, title: string, subtitle: string): St.BoxLayout {
        const status = wrapped('', 'frodo-settings-subtitle');
        const button = textButton('Instalar hook', () => {
            void this.#deps.sessions.installAgentHooks(agent).then(ok => {
                if (this.#destroyed) return;
                if (!ok) status.text = `Não deu para mesclar ${HOOK_PATHS[agent]}. Confira se o arquivo é JSON válido.`;
                void refresh();
            });
        });
        const refresh = async (): Promise<void> => {
            const installed = await this.#deps.sessions.agentHooksInstalled(agent);
            if (this.#destroyed) return;
            button.label = installed ? 'Instalado' : 'Instalar hook';
            button.reactive = !installed;
            button.can_focus = !installed;
            if (installed)
                status.text = `Hook em ${HOOK_PATHS[agent]}. Reinicie o ${agent === 'codex' ? 'Codex' : 'Gemini CLI'} para valer.`;
        };
        void refresh();
        const text = column('frodo-settings-line-text');
        text.add_child(wrapped(subtitle, 'frodo-settings-subtitle'));
        text.add_child(status);
        return line(title, text, button);
    }

    #renderProfiles(): void {
        this.#profiles.destroy_all_children();
        const profiles = this.#deps.settings.claudeProfiles;
        const defaultDir = defaultConfigDir();
        for (const profile of profiles) this.#profiles.add_child(this.#profileRow(profile, isActiveProfile(profile, defaultDir)));
        if (profiles.length === 0) this.#profiles.add_child(dimLabel('Abra a aba IA uma vez para detectar os perfis'));
    }

    #profileRow(profile: ClaudeProfile, active: boolean): St.BoxLayout {
        const settings = this.#deps.settings;
        const name = new St.Entry({style_class: 'frodo-entry frodo-entry-name', hint_text: profile.label, can_focus: true, x_expand: true});
        this.#typing(name);
        name.clutter_text.connect('activate', () => {
            const text = name.text.trim();
            if (text === '' || text === profile.label) return;
            settings.claudeProfiles = settings.claudeProfiles.map(other => (other.id === profile.id ? {...other, label: text} : other));
        });
        const text = column('frodo-settings-profile');
        text.x_expand = true;
        text.add_child(name);
        text.add_child(label(homePath(profile.configDir), 'frodo-integration-subtitle frodo-mono'));
        const item = row('frodo-settings-profile-row');
        item.add_child(text);
        if (active) item.add_child(chip('ativo', 'accent'));
        item.add_child(
            iconButton(
                frodoIcon('close'),
                'Remover perfil',
                () => {
                    settings.claudeProfiles = settings.claudeProfiles.filter(other => other.id !== profile.id);
                },
                'ghost',
                32,
            ),
        );
        return item;
    }

    #addProfile(): void {
        const settings = this.#deps.settings;
        const path = expandHome(this.#newProfile.text, GLib.get_home_dir());
        const profiles = settings.claudeProfiles;
        if (path === '' || !GLib.file_test(path, GLib.FileTest.IS_DIR) || profiles.some(profile => profile.configDir === path)) {
            this.#newProfile.add_style_pseudo_class('error');
            return;
        }
        this.#newProfile.remove_style_pseudo_class('error');
        this.#newProfile.text = '';
        settings.claudeProfiles = [...profiles, profileFor(path)];
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
