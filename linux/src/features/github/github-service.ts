import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {Timer} from '../../shared/timer.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {alertCount, kindsByKey, newAlerts, pruneMuted, visibleAlerts} from './github-alerts.js';
import type {GitHubBackend} from './github-client.types.js';
import {classifyAll, compareBody, GitHubResponseError, mergePulls, parseCompare, parsePage, requestBody} from './github.js';
import {MAX_PAGES} from './github.const.js';
import type {ClassifiedPr, PrKind, PullRequest, SearchKind} from './github.types.js';
import type {GitHubServiceDependencies, GitHubServiceEvents, GitHubStatus} from './github-service.types.js';

class UnauthorizedError extends Error {}

export class GitHubService extends Emitter<GitHubServiceEvents> {
    readonly #settings: FrodoSettings;
    readonly #backend: GitHubBackend;
    readonly #disposables = new Disposables();
    readonly #timer = this.#disposables.own(new Timer());
    #status: GitHubStatus = 'loading';
    #login: string | null = null;
    #pulls: ClassifiedPr[] = [];
    #previous: Map<string, PrKind> | null = null;
    #updatedAt: number | null = null;
    #errorMessage: string | null = null;
    #focused: string | null = null;
    #token: string | null = null;
    #askKeyring = true;
    #run = 0;
    #destroyed = false;

    constructor({settings, backend}: GitHubServiceDependencies) {
        super();
        this.#settings = settings;
        this.#backend = backend;
        this.#disposables.add(
            settings.onChanged(['github-enabled', 'github-auth', 'github-scope', 'github-repos'], () => {
                this.#previous = null;
                this.#token = null;
                this.refresh();
            }),
        );
        this.#disposables.add(
            settings.onChanged('github-poll-minutes', () => {
                this.#schedule();
            }),
        );
        this.#disposables.add(
            settings.onChanged(['github-alerts', 'github-muted'], () => {
                this.emit('changed');
            }),
        );
        this.#schedule();
        this.refresh();
    }

    get status(): GitHubStatus {
        return this.#status;
    }

    get login(): string | null {
        return this.#login;
    }

    get pulls(): readonly ClassifiedPr[] {
        return this.#pulls;
    }

    get updatedAt(): number | null {
        return this.#updatedAt;
    }

    get errorMessage(): string | null {
        return this.#errorMessage;
    }

    get alertCount(): number {
        return alertCount(this.#pulls, this.#settings.githubAlerts, this.#settings.githubMuted);
    }

    get focused(): string | null {
        return this.#focused;
    }

    focus(key: string | null): void {
        this.#focused = key;
        this.emit('changed');
    }

    toggleMuted(key: string): void {
        const muted = this.#settings.githubMuted;
        this.#settings.githubMuted = muted.includes(key) ? muted.filter(other => other !== key) : [...muted, key];
    }

    async saveToken(token: string): Promise<void> {
        await this.#backend.storeToken(token);
        if (this.#destroyed) return;
        this.#previous = null;
        this.#token = null;
        this.refresh();
    }

    connect(): void {
        this.#settings.githubEnabled = true;
    }

    async disconnect(): Promise<void> {
        if (this.#settings.githubAuth === 'token') await this.#backend.clearToken().catch(() => undefined);
        if (!this.#destroyed) this.#settings.githubEnabled = false;
    }

    refresh(): void {
        this.#askKeyring = true;
        void this.#cycle();
    }

    #schedule(): void {
        this.#timer.every(this.#settings.githubPollMinutes * 60, () => {
            void this.#cycle();
        });
    }

    #idle(status: GitHubStatus): void {
        this.#status = status;
        this.#pulls = [];
        this.#login = null;
        this.#previous = null;
        this.#updatedAt = null;
        this.emit('changed');
    }

    async #cycle(): Promise<void> {
        const run = ++this.#run;
        const current = (): boolean => !this.#destroyed && run === this.#run;
        const settings = this.#settings;
        if (!settings.githubEnabled) {
            this.#idle('disabled');
            return;
        }
        if (settings.githubScope === 'list' && settings.githubRepos.length === 0) {
            this.#idle('no-repos');
            return;
        }
        if (this.#token === null && !this.#askKeyring) {
            this.#idle('signed-out');
            return;
        }
        const stored = this.#token ?? (await this.#backend.token(settings.githubAuth).catch(() => null));
        if (!current()) return;
        const token = stored === '' ? null : stored;
        this.#token = token;
        this.#askKeyring = false;
        if (token === null) {
            this.#idle('signed-out');
            return;
        }
        let login: string;
        let found: PullRequest[];
        let complete: boolean;
        try {
            const mine = await this.#search(token, 'mine');
            const review = await this.#search(token, 'review');
            login = mine.login;
            found = mergePulls(mine.pulls, review.pulls);
            complete = mine.complete && review.complete;
        } catch (error) {
            if (!current()) return;
            if (error instanceof UnauthorizedError) {
                this.#token = null;
                this.#idle('bad-token');
                return;
            }
            this.#status = error instanceof GitHubResponseError ? 'error' : 'offline';
            this.#errorMessage = error instanceof GitHubResponseError ? error.message : null;
            this.emit('changed');
            return;
        }
        if (!current()) return;
        const classified = await this.#withBehind(token, classifyAll(found, this.#pulls));
        if (!current()) return;
        const fresh = visibleAlerts(newAlerts(this.#previous, classified), settings.githubAlerts, settings.githubMuted);
        this.#previous = kindsByKey(classified);
        this.#pulls = classified;
        this.#login = login;
        this.#status = 'ok';
        this.#errorMessage = null;
        this.#updatedAt = Date.now();
        const muted = complete ? pruneMuted(settings.githubMuted, found) : settings.githubMuted;
        if (muted.length !== settings.githubMuted.length) settings.githubMuted = muted;
        this.emit('changed');
        if (fresh.length > 0) this.emit('alert', fresh);
    }

    async #search(token: string, kind: SearchKind): Promise<{login: string; pulls: PullRequest[]; complete: boolean}> {
        const pulls: PullRequest[] = [];
        let login = '';
        let after: string | null = null;
        for (let index = 0; index < MAX_PAGES; index++) {
            const response = await this.#backend.post(
                token,
                requestBody(kind, this.#settings.githubScope, this.#settings.githubRepos, after),
            );
            if (response.status === 401) throw new UnauthorizedError();
            if (response.status !== 200) throw new Error(`GitHub respondeu HTTP ${String(response.status)}`);
            const page = parsePage(response.body, kind === 'review');
            login = page.login;
            pulls.push(...page.pulls);
            after = page.next;
            if (after === null) break;
        }
        return {login, pulls, complete: after === null};
    }

    async #withBehind(token: string, prs: ClassifiedPr[]): Promise<ClassifiedPr[]> {
        const conflicts = prs.filter(pr => pr.kind === 'conflict');
        if (conflicts.length === 0) return prs;
        try {
            const response = await this.#backend.post(token, compareBody(conflicts));
            const behind = response.status === 200 ? parseCompare(response.body, conflicts) : new Map<string, number>();
            return prs.map(pr => ({...pr, behindBy: behind.get(pr.key) ?? null}));
        } catch {
            return prs;
        }
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposables.dispose();
        this.#backend.destroy();
        this.clearListeners();
    }
}
