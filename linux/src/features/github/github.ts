import {count, isRecord, optionalString, text} from '../../shared/json.js';
import {formatAgo} from '../../shared/format.js';
import type {GitHubScope} from '../../settings/schema-values.types.js';
import {
    CHANGES_BODY_MAX,
    DECISIONS,
    FAILED_CONCLUSIONS,
    GITHUB_GRAPHQL_URL,
    GITHUB_QUERY,
    MERGEABLE,
    PR_KINDS,
    ROLLUPS,
    SEARCH_BASE,
} from './github.const.js';
import type {CheckState, ClassifiedPr, GitHubPage, PrAction, PrCheck, PrDetail, PrKind, PullRequest, SearchKind} from './github.types.js';

export class GitHubResponseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GitHubResponseError';
    }
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
    return values.find(item => item === value) ?? null;
}

function field(value: unknown, ...path: string[]): unknown {
    let current = value;
    for (const key of path) current = isRecord(current) ? current[key] : undefined;
    return current;
}

function nodes(value: unknown): unknown[] {
    const list = field(value, 'nodes');
    return Array.isArray(list) ? list : [];
}

function login(value: unknown): string {
    return text(field(value, 'login')) ?? 'ghost';
}

export function requestBody(search: SearchKind, scope: GitHubScope, repos: readonly string[], after: string | null): string {
    const who = search === 'mine' ? 'author:@me' : 'user-review-requested:@me';
    const filter = scope === 'list' ? repos.map(repo => ` repo:${repo}`).join('') : '';
    return JSON.stringify({query: GITHUB_QUERY, variables: {q: `${SEARCH_BASE} ${who}${filter}`, after}});
}

function checkState(context: unknown): PrCheck | null {
    if (field(context, '__typename') === 'StatusContext') {
        const name = text(field(context, 'context'));
        const state = field(context, 'state');
        if (name === null) return null;
        const mapped: CheckState = state === 'SUCCESS' ? 'ok' : state === 'FAILURE' || state === 'ERROR' ? 'fail' : 'pending';
        return {name, state: mapped};
    }
    const name = text(field(context, 'name'));
    if (name === null) return null;
    if (field(context, 'status') !== 'COMPLETED') return {name, state: 'pending'};
    const conclusion = field(context, 'conclusion');
    return {name, state: FAILED_CONCLUSIONS.some(failed => failed === conclusion) ? 'fail' : 'ok'};
}

function parsePull(value: unknown, reviewRequested: boolean): PullRequest | null {
    const repo = text(field(value, 'repository', 'nameWithOwner'));
    const number = field(value, 'number');
    const url = text(field(value, 'url'));
    if (repo === null || typeof number !== 'number' || url === null) return null;
    const rollup = field(nodes(field(value, 'commits'))[0], 'commit', 'statusCheckRollup');
    const changes = nodes(field(value, 'changes'))[0];
    const approved = nodes(field(value, 'approved'))[0];
    const updatedAt = Date.parse(optionalString(field(value, 'updatedAt')) ?? '');
    return {
        key: `${repo}#${String(number)}`,
        repo,
        number,
        title: optionalString(field(value, 'title')) ?? '',
        url,
        head: optionalString(field(value, 'headRefName')) ?? '',
        base: optionalString(field(value, 'baseRefName')) ?? '',
        author: login(field(value, 'author')),
        additions: count(field(value, 'additions')),
        deletions: count(field(value, 'deletions')),
        files: count(field(value, 'changedFiles')),
        comments: count(field(value, 'comments', 'totalCount')),
        updatedAt: Number.isNaN(updatedAt) ? 0 : updatedAt,
        mergeable: oneOf(MERGEABLE, field(value, 'mergeable')) ?? 'UNKNOWN',
        reviewDecision: oneOf(DECISIONS, field(value, 'reviewDecision')),
        changesBy:
            changes === undefined ? null : {author: login(field(changes, 'author')), body: optionalString(field(changes, 'body')) ?? ''},
        approvedBy: approved === undefined ? null : login(field(approved, 'author')),
        rollup: oneOf(ROLLUPS, field(rollup, 'state')),
        checks: nodes(field(rollup, 'contexts'))
            .map(checkState)
            .filter((check): check is PrCheck => check !== null),
        behindBy: null,
        reviewRequested,
    };
}

function parseJson(body: string): unknown {
    try {
        return JSON.parse(body) as unknown;
    } catch {
        return null;
    }
}

export function parsePage(body: string, reviewRequested: boolean): GitHubPage {
    const parsed = parseJson(body);
    const data = field(parsed, 'data');
    if (!isRecord(data) || !isRecord(data.search)) {
        const errors = field(parsed, 'errors');
        const message = Array.isArray(errors) ? optionalString(field(errors[0], 'message')) : null;
        throw new GitHubResponseError(message ?? 'Resposta inesperada do GitHub');
    }
    const pulls = nodes(data.search)
        .map(item => parsePull(item, reviewRequested))
        .filter((pull): pull is PullRequest => pull !== null);
    const more = field(data.search, 'pageInfo', 'hasNextPage') === true;
    return {login: login(data.viewer), pulls, next: more ? text(field(data.search, 'pageInfo', 'endCursor')) : null};
}

export function mergePulls(mine: readonly PullRequest[], review: readonly PullRequest[]): PullRequest[] {
    const pulls = new Map<string, PullRequest>();
    for (const pull of [...mine, ...review]) if (!pulls.has(pull.key)) pulls.set(pull.key, pull);
    return [...pulls.values()];
}

export function classify(pr: PullRequest): PrKind | null {
    if (pr.reviewRequested) return 'review';
    if (pr.mergeable === 'CONFLICTING') return 'conflict';
    if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'changes';
    if (pr.rollup === 'FAILURE' || pr.rollup === 'ERROR') return 'ci';
    if (pr.reviewDecision === 'APPROVED' && pr.mergeable === 'MERGEABLE' && (pr.rollup === null || pr.rollup === 'SUCCESS')) return 'ready';
    return null;
}

export function classifyAll(pulls: readonly PullRequest[], previous: readonly ClassifiedPr[]): ClassifiedPr[] {
    const before = new Map(previous.map(pr => [pr.key, pr]));
    const result: ClassifiedPr[] = [];
    for (const pull of pulls) {
        const mergeable = pull.mergeable === 'UNKNOWN' ? (before.get(pull.key)?.mergeable ?? 'UNKNOWN') : pull.mergeable;
        const resolved = {...pull, mergeable};
        const kind = classify(resolved);
        if (kind !== null) result.push({...resolved, kind});
    }
    return result.sort((a, b) => PR_KINDS.indexOf(a.kind) - PR_KINDS.indexOf(b.kind) || b.updatedAt - a.updatedAt);
}

function plural(n: number, one: string, many: string): string {
    return `${String(n)} ${n === 1 ? one : many}`;
}

function quoted(body: string): string {
    const clean = body.trim();
    if (clean === '') return 'Sem comentário geral; veja os comentários no código.';
    return `“${clean.length > CHANGES_BODY_MAX ? `${clean.slice(0, CHANGES_BODY_MAX)}…` : clean}”`;
}

export function prDetail(pr: ClassifiedPr): PrDetail {
    switch (pr.kind) {
        case 'conflict':
            if (pr.base === '') return {title: 'Conflito com a base', body: '', command: null};
            return {
                title: `Conflito com ${pr.base}`,
                body:
                    pr.behindBy === null
                        ? ''
                        : `A ${pr.base} recebeu ${plural(pr.behindBy, 'commit', 'commits')} depois que o PR foi aberto.`,
                command: `git fetch origin && git rebase origin/${pr.base}`,
            };
        case 'changes':
            return {title: `@${pr.changesBy?.author ?? 'ghost'} pediu alterações`, body: quoted(pr.changesBy?.body ?? ''), command: null};
        case 'ci': {
            const failed = pr.checks.filter(check => check.state === 'fail');
            const [first] = failed;
            const title = failed.length > 1 ? `${String(failed.length)} checks falharam` : `O check ${first?.name ?? 'do CI'} falhou`;
            return {title, body: 'Veja os logs do CI para os detalhes.', command: null};
        }
        case 'review': {
            const files = plural(pr.files, 'arquivo alterado.', 'arquivos alterados.');
            return {
                title: `@${pr.author} pediu sua revisão`,
                body: pr.rollup === 'SUCCESS' ? `${files} Os checks passaram.` : files,
                command: null,
            };
        }
        case 'ready':
            return {
                title: `Aprovado por @${pr.approvedBy ?? 'ghost'}`,
                body: 'Todos os checks passaram e não há conflitos.',
                command: null,
            };
    }
}

export function primaryAction(pr: ClassifiedPr): PrAction {
    switch (pr.kind) {
        case 'changes':
            return {label: 'Ver alterações pedidas', url: pr.url};
        case 'ci':
            return {label: 'Ver logs do CI', url: `${pr.url}/checks`};
        case 'review':
            return {label: 'Revisar agora', url: `${pr.url}/files`};
        case 'conflict':
        case 'ready':
            return {label: 'Abrir no GitHub', url: pr.url};
    }
}

export function shortRef(pr: PullRequest): string {
    return `${pr.repo.split('/').pop() ?? pr.repo}#${String(pr.number)}`;
}

export function alertTitle(pr: ClassifiedPr): string {
    const ref = shortRef(pr);
    switch (pr.kind) {
        case 'conflict':
            return `${ref} está com conflito`;
        case 'changes':
            return `${ref} tem alterações pedidas`;
        case 'ci':
            return `${ref} está com CI falhando`;
        case 'review':
            return `@${pr.author} pediu sua revisão em ${ref}`;
        case 'ready':
            return `${ref} está pronto para merge`;
    }
}

export function tokenFromHostsYaml(yaml: string): string | null {
    const lines = yaml.split('\n');
    const start = lines.findIndex(line => line.trimEnd() === 'github.com:');
    if (start < 0) return null;
    const block: string[] = [];
    for (const line of lines.slice(start + 1)) {
        if (line.trim() !== '' && !line.startsWith(' ')) break;
        block.push(line);
    }
    const token = (line: string | undefined): string | null => (line ? (/oauth_token:\s*(\S+)/.exec(line)?.[1] ?? null) : null);
    return token(block.find(line => /^ {4}oauth_token:/.test(line))) ?? token(block.find(line => line.includes('oauth_token:')));
}

export function isRepoName(value: string): boolean {
    return /^[\w.-]+\/[\w.-]+$/.test(value);
}

export function compareBody(prs: readonly ClassifiedPr[]): string {
    const parts = prs.map((pr, index) => {
        const [owner = '', name = ''] = pr.repo.split('/');
        return `c${String(index)}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ref(qualifiedName: ${JSON.stringify(`refs/heads/${pr.base}`)}) { compare(headRef: ${JSON.stringify(pr.head)}) { behindBy } } }`;
    });
    return JSON.stringify({query: `query { ${parts.join(' ')} }`});
}

export function parseCompare(body: string, prs: readonly ClassifiedPr[]): Map<string, number> {
    const data = field(parseJson(body), 'data');
    const result = new Map<string, number>();
    prs.forEach((pr, index) => {
        const behind = field(data, `c${String(index)}`, 'ref', 'compare', 'behindBy');
        if (typeof behind === 'number') result.set(pr.key, behind);
    });
    return result;
}

function ago(thenMs: number, nowMs: number): string {
    const text = formatAgo(thenMs, nowMs);
    return text === 'agora' ? text : `há ${text}`;
}

export function prMeta(pr: PullRequest, muted: boolean, nowMs: number): string {
    const parts = [`+${String(pr.additions)} −${String(pr.deletions)}`, plural(pr.files, 'arquivo', 'arquivos')];
    if (pr.comments > 0) parts.push(plural(pr.comments, 'comentário', 'comentários'));
    parts.push(ago(pr.updatedAt, nowMs));
    if (muted) parts.push('alertas silenciados');
    return parts.join(' · ');
}

export function updatedText(updatedAt: number | null, offline: boolean, nowMs: number): string {
    if (updatedAt === null) return offline ? 'Sem conexão' : '';
    const when = ago(updatedAt, nowMs);
    return offline ? `Sem conexão · atualizado ${when}` : `Atualizado ${when}`;
}

export function initials(login: string): string {
    const clean = login.replace(/^@/, '');
    return clean === '' ? '?' : clean.slice(0, 2).toUpperCase();
}

export function graphqlUrl(override: string | null): string {
    return override !== null && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(override) ? override : GITHUB_GRAPHQL_URL;
}
