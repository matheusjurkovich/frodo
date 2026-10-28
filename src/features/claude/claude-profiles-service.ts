import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {parseCredentials} from './claude-credentials.js';
import {parseProfiles} from '../../settings/claude-profile.js';
import type {ClaudeProfile} from '../../settings/claude-profile.js';
import {labelForDirName} from './claude-profiles.js';
import {credentialsPath, defaultConfigDir} from './claude-client.js';
import {readTextFile} from '../../shared/files.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');

const ORIGINAL_SCHEMA = 'org.gnome.shell.extensions.claude-usage';
const ORIGINAL_UUID = 'claude-usage@dvdstelt.github.io';

let sequence = 0;

export function makeProfileId(): string {
    sequence += 1;
    return `p${Date.now().toString(36)}${sequence.toString(36)}`;
}

export function profileFor(configDir: string): ClaudeProfile {
    return {id: makeProfileId(), label: labelForDirName(GLib.path_get_basename(configDir)), configDir};
}

async function hasCredentials(configDir: string): Promise<boolean> {
    return parseCredentials(await readTextFile(credentialsPath(configDir))) !== null;
}

export async function discoverConfigDirs(): Promise<string[]> {
    const home = GLib.get_home_dir();
    const found: string[] = [];
    try {
        const enumerator = await Gio.File.new_for_path(home).enumerate_children_async(
            'standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            null,
        );
        for (let infos = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null); infos.length > 0;) {
            for (const info of infos) {
                const name = info.get_name();
                if (info.get_file_type() !== Gio.FileType.DIRECTORY || (name !== '.claude' && !name.startsWith('.claude-'))) continue;
                const configDir = GLib.build_filenamev([home, name]);
                if (await hasCredentials(configDir)) found.push(configDir);
            }
            infos = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null);
        }
    } catch {
        return found;
    }
    return found.sort((a, b) => (a.endsWith('/.claude') ? -1 : b.endsWith('/.claude') ? 1 : a.localeCompare(b)));
}

export function originalExtensionProfiles(): ClaudeProfile[] {
    const directory = GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', ORIGINAL_UUID, 'schemas']);
    if (!GLib.file_test(directory, GLib.FileTest.IS_DIR)) return [];
    try {
        const source = Gio.SettingsSchemaSource.new_from_directory(directory, Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(ORIGINAL_SCHEMA, false);
        if (!schema?.has_key('profiles')) return [];
        return parseProfiles(new Gio.Settings({settings_schema: schema}).get_string('profiles'));
    } catch {
        return [];
    }
}

export async function ensureProfiles(settings: FrodoSettings): Promise<ClaudeProfile[]> {
    const existing = settings.claudeProfiles;
    if (existing.length > 0 || settings.claudeProfilesInitialized) return existing;
    const imported = originalExtensionProfiles();
    const seeded = imported.length > 0 ? imported : (await discoverConfigDirs()).map(profileFor);
    const profiles = seeded.length > 0 ? seeded : [profileFor(defaultConfigDir())];
    settings.claudeProfiles = profiles;
    settings.claudeProfilesInitialized = true;
    return profiles;
}
