import {GitHubService} from './github-service.js';
import type {GitHubBackend, GitHubHttpResponse} from './github-client.types.js';
import type {ClassifiedPr} from './github.types.js';
import {createSettings, waitFor} from '../../../tests/fixtures.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Timer} from '../../shared/timer.js';

interface Pull {
    readonly number: number;
    readonly mergeable?: string;
    readonly decision?: string | null;
    readonly rollup?: string;
}

function node({number, mergeable = 'MERGEABLE', decision = 'REVIEW_REQUIRED', rollup = 'SUCCESS'}: Pull): unknown {
    return {
        number,
        title: `PR ${String(number)}`,
        url: `https://github.com/dono/frodo/pull/${String(number)}`,
        headRefName: 'feat/x',
        baseRefName: 'master',
        author: {login: 'eu'},
        repository: {nameWithOwner: 'dono/frodo'},
        updatedAt: '2026-11-17T10:00:00Z',
        mergeable,
        reviewDecision: decision,
        commits: {nodes: [{commit: {statusCheckRollup: {state: rollup, contexts: {nodes: []}}}}]},
    };
}

function page(pulls: readonly Pull[]): GitHubHttpResponse {
    return {
        status: 200,
        body: JSON.stringify({
            data: {viewer: {login: 'eu'}, search: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: pulls.map(node)}},
        }),
    };
}

class FakeBackend implements GitHubBackend {
    tokenValue: string | null = 'gho_teste';
    mine: GitHubHttpResponse | Error = page([]);
    review: GitHubHttpResponse = page([]);
    compare: GitHubHttpResponse = {status: 200, body: '{"data":{}}'};
    posts: string[] = [];
    stored: string[] = [];
    cleared = 0;
    failStore = false;
    delayMs = 0;
    failClear = false;
    destroyed = false;

    lookups = 0;

    token(): Promise<string | null> {
        this.lookups++;
        return Promise.resolve(this.tokenValue);
    }

    storeToken(token: string): Promise<void> {
        if (this.failStore) return Promise.reject(new Error('chaveiro fechado'));
        this.stored.push(token);
        this.tokenValue = token;
        return Promise.resolve();
    }

    clearToken(): Promise<void> {
        if (this.failClear) return Promise.reject(new Error('chaveiro fechado'));
        this.cleared++;
        this.tokenValue = null;
        return Promise.resolve();
    }

    post(_token: string, body: string): Promise<GitHubHttpResponse> {
        this.posts.push(body);
        if (!body.includes('"variables"')) return Promise.resolve(this.compare);
        if (body.includes('user-review-requested')) return Promise.resolve(this.review);
        const mine = this.mine;
        if (mine instanceof Error) return Promise.reject(mine);
        if (this.delayMs === 0) return Promise.resolve(mine);
        return new Promise(resolve => {
            new Timer().once(this.delayMs, () => {
                resolve(mine);
            });
        });
    }

    destroy(): void {
        this.destroyed = true;
    }
}

const CONFLICT: Pull = {number: 1, mergeable: 'CONFLICTING'};
const FAILING: Pull = {number: 2, rollup: 'FAILURE'};

describe('GitHubService', () => {
    let settings: FrodoSettings;
    let backend: FakeBackend;
    let service: GitHubService | null;
    let alerts: (readonly ClassifiedPr[])[];

    function start(): GitHubService {
        service = new GitHubService({settings, backend});
        service.on('alert', prs => {
            alerts.push(prs);
        });
        return service;
    }

    async function cycle(github: GitHubService): Promise<void> {
        const before = backend.posts.length;
        github.refresh();
        await waitFor(github, () => backend.posts.length > before && github.status !== 'loading');
        await new Promise<void>(resolve => {
            new Timer().once(20, resolve);
        });
    }

    beforeEach(() => {
        settings = createSettings();
        backend = new FakeBackend();
        service = null;
        alerts = [];
    });

    afterEach(() => {
        service?.destroy();
    });

    it('sem token fica desconectado e não busca nada', async () => {
        backend.tokenValue = null;
        const github = start();
        await waitFor(github, () => github.status === 'signed-out');
        expect(backend.posts).toEqual([]);
    });

    it('desligado não busca nada', async () => {
        settings.githubEnabled = false;
        const github = start();
        await waitFor(github, () => github.status === 'disabled');
        expect(backend.posts).toEqual([]);
    });

    it('escopo de lista vazia não busca nada', async () => {
        settings.githubScope = 'list';
        const github = start();
        await waitFor(github, () => github.status === 'no-repos');
        expect(backend.posts).toEqual([]);
    });

    it('primeiro ciclo só registra; o seguinte alerta o que é novo', async () => {
        backend.mine = page([CONFLICT]);
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        expect(github.pulls.map(pr => pr.kind)).toEqual(['conflict']);
        expect(github.alertCount).toBe(1);
        expect(github.login).toBe('eu');
        expect(alerts).toEqual([]);
        backend.mine = page([CONFLICT, FAILING]);
        await cycle(github);
        expect(alerts.map(prs => prs.map(pr => pr.key))).toEqual([['dono/frodo#2']]);
    });

    it('rede fora mantém os dados e não perde a referência', async () => {
        backend.mine = page([CONFLICT]);
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        backend.mine = new Error('sem rede');
        await cycle(github);
        expect(github.status).toBe('offline');
        expect(github.pulls.length).toBe(1);
        expect(github.alertCount).toBe(1);
        backend.mine = page([CONFLICT]);
        await cycle(github);
        expect(github.status).toBe('ok');
        expect(alerts).toEqual([]);
    });

    it('HTTP 5xx conta como rede fora', async () => {
        backend.mine = page([CONFLICT]);
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        backend.mine = {status: 502, body: '<html>'};
        await cycle(github);
        expect(github.status).toBe('offline');
        expect(github.pulls.length).toBe(1);
    });

    it('erro do GraphQL mostra a mensagem e mantém os PRs', async () => {
        backend.mine = page([CONFLICT]);
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        backend.mine = {status: 200, body: JSON.stringify({errors: [{message: 'repositório não encontrado'}]})};
        await cycle(github);
        expect(github.status).toBe('error');
        expect(github.errorMessage).toBe('repositório não encontrado');
        expect(github.pulls.length).toBe(1);
    });

    it('token recusado vira bad-token', async () => {
        backend.mine = {status: 401, body: ''};
        const github = start();
        await waitFor(github, () => github.status === 'bad-token');
        expect(github.pulls).toEqual([]);
    });

    it('token recusado depois de sincronizar mantém os PRs e o horário da última sincronização', async () => {
        backend.mine = page([CONFLICT]);
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        const updatedAt = github.updatedAt;
        backend.mine = {status: 401, body: ''};
        await cycle(github);
        expect(github.status).toBe('bad-token');
        expect(github.pulls.length).toBe(1);
        expect(github.updatedAt).toBe(updatedAt);
    });

    it('com token recusado, o timer não troca a falha por desconectado nem pede o chaveiro', async () => {
        const every = spyOn(Timer.prototype, 'every').and.callThrough();
        backend.mine = {status: 401, body: ''};
        const github = start();
        await waitFor(github, () => github.status === 'bad-token');
        every.calls.mostRecent().args[1]();
        await new Promise<void>(resolve => {
            new Timer().once(30, resolve);
        });
        expect(github.status).toBe('bad-token');
        expect(backend.lookups).toBe(1);
    });

    it('mudar o escopo zera a referência', async () => {
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        backend.mine = page([CONFLICT]);
        settings.githubRepos = ['dono/frodo'];
        settings.githubScope = 'list';
        await waitFor(github, () => github.pulls.length === 1);
        expect(alerts).toEqual([]);
    });

    it('tipo desligado não alerta e religar não alerta o que já existia', async () => {
        settings.githubAlerts = ['ci'];
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        backend.mine = page([CONFLICT]);
        await cycle(github);
        expect(alerts).toEqual([]);
        expect(github.alertCount).toBe(0);
        settings.githubAlerts = ['ci', 'conflict'];
        await cycle(github);
        expect(alerts).toEqual([]);
        expect(github.alertCount).toBe(1);
    });

    it('silencia e reativa um PR', async () => {
        backend.mine = page([CONFLICT]);
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        github.toggleMuted('dono/frodo#1');
        expect(settings.githubMuted).toEqual(['dono/frodo#1']);
        expect(github.alertCount).toBe(0);
        github.toggleMuted('dono/frodo#1');
        expect(settings.githubMuted).toEqual([]);
    });

    it('esquece o silêncio de PR que sumiu', async () => {
        settings.githubMuted = ['dono/frodo#9'];
        backend.mine = page([CONFLICT]);
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        expect(settings.githubMuted).toEqual([]);
    });

    it('preenche quanto a base andou nos PRs em conflito', async () => {
        backend.mine = page([CONFLICT]);
        backend.compare = {status: 200, body: JSON.stringify({data: {c0: {ref: {compare: {behindBy: 3}}}}})};
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        expect(github.pulls[0]?.behindBy).toBe(3);
    });

    it('foca um PR e avisa', () => {
        const github = start();
        const changed = jasmine.createSpy('changed');
        github.on('changed', changed);
        github.focus('dono/frodo#1');
        expect(github.focused).toBe('dono/frodo#1');
        expect(changed).toHaveBeenCalled();
    });

    it('salvar token zera a referência e busca de novo', async () => {
        backend.tokenValue = null;
        const github = start();
        await waitFor(github, () => github.status === 'signed-out');
        backend.mine = page([CONFLICT]);
        await github.saveToken('github_pat_x');
        await waitFor(github, () => github.status === 'ok');
        expect(backend.stored).toEqual(['github_pat_x']);
        expect(alerts).toEqual([]);
    });

    it('desconectar desliga e, no modo token, apaga o token', async () => {
        settings.githubAuth = 'token';
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        await github.disconnect();
        expect(settings.githubEnabled).toBeFalse();
        expect(backend.cleared).toBe(1);
        await waitFor(github, () => github.status === 'disabled');
        github.connect();
        expect(settings.githubEnabled).toBeTrue();
    });

    it('reaproveita o token entre ciclos e busca de novo quando a conta muda ou o GitHub recusa', async () => {
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        await cycle(github);
        expect(backend.lookups).toBe(1);
        backend.mine = {status: 401, body: ''};
        await cycle(github);
        expect(github.status).toBe('bad-token');
        backend.mine = page([]);
        await cycle(github);
        expect(backend.lookups).toBe(2);
        settings.githubAuth = 'token';
        await waitFor(github, () => backend.lookups === 3);
    });

    it('mantém o silêncio de PR que só saiu da lista mas segue aberto', async () => {
        backend.mine = page([CONFLICT]);
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        github.toggleMuted('dono/frodo#1');
        backend.mine = page([{number: 1, rollup: 'PENDING'}]);
        await cycle(github);
        expect(github.pulls).toEqual([]);
        expect(settings.githubMuted).toEqual(['dono/frodo#1']);
    });

    it('sem token, o timer não volta a pedir o chaveiro; atualizar à mão pede', async () => {
        const every = spyOn(Timer.prototype, 'every').and.callThrough();
        backend.tokenValue = null;
        const github = start();
        await waitFor(github, () => github.status === 'signed-out');
        const tick = every.calls.mostRecent().args[1];
        tick();
        tick();
        await new Promise<void>(resolve => {
            new Timer().once(30, resolve);
        });
        expect(backend.lookups).toBe(1);
        github.refresh();
        await new Promise<void>(resolve => {
            new Timer().once(30, resolve);
        });
        expect(backend.lookups).toBe(2);
    });

    it('desconectar desliga mesmo se o chaveiro falhar', async () => {
        settings.githubAuth = 'token';
        backend.failClear = true;
        const github = start();
        await waitFor(github, () => github.status === 'ok');
        await github.disconnect();
        expect(settings.githubEnabled).toBeFalse();
    });

    it('salvar token que o chaveiro recusa avisa quem chamou', async () => {
        backend.failStore = true;
        const github = start();
        await expectAsync(github.saveToken('github_pat_x')).toBeRejected();
    });

    it('volta a buscar mostrando carregando depois de conectar', async () => {
        backend.tokenValue = null;
        const github = start();
        await waitFor(github, () => github.status === 'signed-out');
        const seen: string[] = [];
        github.on('changed', () => {
            seen.push(github.status);
        });
        await github.saveToken('github_pat_x');
        await waitFor(github, () => github.status === 'ok');
        expect(seen[0]).toBe('loading');
    });

    it('atualizar durante uma busca não abre outra em paralelo', async () => {
        backend.delayMs = 50;
        const github = start();
        await new Promise<void>(resolve => {
            new Timer().once(10, resolve);
        });
        github.refresh();
        github.refresh();
        await waitFor(github, () => github.status === 'ok');
        await new Promise<void>(resolve => {
            new Timer().once(30, resolve);
        });
        expect(backend.posts.filter(body => body.includes('author:@me')).length).toBe(1);
    });

    it('HTTP 403 vira erro com o código, não falta de conexão', async () => {
        backend.mine = {status: 403, body: ''};
        const github = start();
        await waitFor(github, () => github.status === 'error');
        expect(github.errorMessage).toBe('GitHub respondeu HTTP 403');
    });

    it('destrói o cliente junto', () => {
        start().destroy();
        service = null;
        expect(backend.destroyed).toBeTrue();
    });

    it('verifica no intervalo configurado', () => {
        const every = spyOn(Timer.prototype, 'every');
        start();
        expect(every).toHaveBeenCalledWith(300, jasmine.any(Function));
        settings.githubPollMinutes = 2;
        expect(every).toHaveBeenCalledWith(120, jasmine.any(Function));
    });
});
