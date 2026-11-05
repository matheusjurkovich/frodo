import {discoverConfigDirs, ensureProfiles, makeProfileId, profileFor} from './claude-profiles-service.js';
import {createSettings, removeDirs, tmpDir, writeFile} from '../../../tests/fixtures.js';

const CREDENTIALS = JSON.stringify({claudeAiOauth: {accessToken: 't'}});

describe('claude-profiles-service', () => {
    const dirs: string[] = [];

    afterEach(() => {
        removeDirs(dirs);
    });

    it('makeProfileId não repete no mesmo milissegundo', () => {
        const ids = Array.from({length: 50}, () => makeProfileId());
        expect(new Set(ids).size).toBe(50);
        expect(ids.every(id => /^p[0-9a-z]+$/.test(id))).toBeTrue();
    });

    it('profileFor nomeia o perfil pela pasta', () => {
        expect(profileFor('/home/u/.claude-trabalho_extra')).toEqual({
            id: jasmine.any(String),
            label: 'Trabalho Extra',
            configDir: '/home/u/.claude-trabalho_extra',
        });
        expect(profileFor('/home/u/.claude').label).toBe('Claude');
    });

    it('descobre pastas .claude com login, com a padrão primeiro', async () => {
        const home = tmpDir(dirs);
        for (const name of ['.claude-z', '.claude', '.claude-a', '.claudex']) writeFile(`${home}/${name}/.credentials.json`, CREDENTIALS);
        writeFile(`${home}/.claude-sem-login/.credentials.json`, '{}');
        writeFile(`${home}/.claude-arquivo`, CREDENTIALS);
        expect(await discoverConfigDirs(home)).toEqual([`${home}/.claude`, `${home}/.claude-a`, `${home}/.claude-z`]);
    });

    it('home que não existe não acha nada', async () => {
        expect(await discoverConfigDirs(`${tmpDir(dirs)}/nada`)).toEqual([]);
    });

    it('ensureProfiles mantém os perfis já gravados', async () => {
        const settings = createSettings();
        const profiles = [{id: 'x', label: 'X', configDir: '/c'}];
        settings.claudeProfiles = profiles;
        expect(await ensureProfiles(settings)).toEqual(profiles);
        expect(settings.claudeProfilesInitialized).toBeFalse();
    });

    it('ensureProfiles não recria perfis que o usuário apagou', async () => {
        const settings = createSettings();
        settings.claudeProfilesInitialized = true;
        expect(await ensureProfiles(settings)).toEqual([]);
        expect(settings.claudeProfiles).toEqual([]);
    });

    it('ensureProfiles semeia ao menos um perfil e marca como feito', async () => {
        const settings = createSettings();
        const profiles = await ensureProfiles(settings);
        expect(profiles.length).toBeGreaterThan(0);
        expect(settings.claudeProfiles).toEqual(profiles);
        expect(settings.claudeProfilesInitialized).toBeTrue();
    });
});
