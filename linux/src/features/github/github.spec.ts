import {
    alertTitle,
    classify,
    classifyAll,
    compareBody,
    GitHubResponseError,
    isRepoName,
    mergePulls,
    parseCompare,
    parsePage,
    prDetail,
    primaryAction,
    requestBody,
    shortRef,
    tokenFromHostsYaml,
} from './github.js';
import type {ClassifiedPr, PullRequest} from './github.types.js';

function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        number: 42,
        title: 'feat: aba do GitHub na ilha',
        url: 'https://github.com/dono/frodo/pull/42',
        headRefName: 'feat/github',
        baseRefName: 'master',
        author: {login: 'matheusjurkovich'},
        repository: {nameWithOwner: 'dono/frodo'},
        additions: 640,
        deletions: 88,
        changedFiles: 14,
        comments: {totalCount: 3},
        updatedAt: '2026-11-17T10:00:00Z',
        mergeable: 'MERGEABLE',
        reviewDecision: 'REVIEW_REQUIRED',
        changes: {nodes: []},
        approved: {nodes: []},
        commits: {
            nodes: [
                {
                    commit: {
                        statusCheckRollup: {
                            state: 'SUCCESS',
                            contexts: {
                                nodes: [
                                    {__typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS'},
                                    {__typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE'},
                                    {__typename: 'CheckRun', name: 'e2e', status: 'IN_PROGRESS', conclusion: null},
                                    {__typename: 'StatusContext', context: 'ci/lint', state: 'SUCCESS'},
                                ],
                            },
                        },
                    },
                },
            ],
        },
        ...overrides,
    };
}

function page(items: unknown[], next: string | null = null): string {
    return JSON.stringify({
        data: {viewer: {login: 'matheusjurkovich'}, search: {pageInfo: {hasNextPage: next !== null, endCursor: next}, nodes: items}},
    });
}

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
    return {
        key: 'dono/frodo#42',
        repo: 'dono/frodo',
        number: 42,
        title: 'feat: aba do GitHub na ilha',
        url: 'https://github.com/dono/frodo/pull/42',
        head: 'feat/github',
        base: 'master',
        author: 'matheusjurkovich',
        additions: 1,
        deletions: 1,
        files: 5,
        comments: 0,
        updatedAt: 0,
        mergeable: 'MERGEABLE',
        reviewDecision: 'REVIEW_REQUIRED',
        changesBy: null,
        approvedBy: null,
        rollup: 'SUCCESS',
        checks: [],
        behindBy: null,
        reviewRequested: false,
        ...overrides,
    };
}

function classified(overrides: Partial<ClassifiedPr> = {}): ClassifiedPr {
    return {...pr(overrides), kind: overrides.kind ?? 'conflict'};
}

describe('github', () => {
    it('monta a busca dos meus PRs e das revisões, filtrando por repositório na lista', () => {
        const parse = (body: string): {query: string; variables: {q: string; after: string | null}} =>
            JSON.parse(body) as {query: string; variables: {q: string; after: string | null}};
        const mine = parse(requestBody('mine', 'list', ['a/b', 'c/d'], null));
        expect(mine.variables).toEqual({q: 'is:pr is:open archived:false author:@me repo:a/b repo:c/d', after: null});
        expect(mine.query).toContain('fragment Pr on PullRequest');
        expect(mine.query).toContain('first: 20');
        const review = parse(requestBody('review', 'mine', ['a/b'], 'Y3Vy'));
        expect(review.variables).toEqual({q: 'is:pr is:open archived:false user-review-requested:@me', after: 'Y3Vy'});
    });

    it('lê uma página de PRs com checks normalizados e o cursor da próxima', () => {
        const result = parsePage(page([node(), node({number: 7, url: 'u7'})], 'Y3Vy'), false);
        expect(result.login).toBe('matheusjurkovich');
        expect(result.next).toBe('Y3Vy');
        expect(result.pulls.map(p => p.key)).toEqual(['dono/frodo#42', 'dono/frodo#7']);
        const first = result.pulls[0];
        expect(first?.files).toBe(14);
        expect(first?.comments).toBe(3);
        expect(first?.updatedAt).toBe(Date.parse('2026-11-17T10:00:00Z'));
        expect(first?.rollup).toBe('SUCCESS');
        expect(first?.behindBy).toBeNull();
        expect(first?.reviewRequested).toBeFalse();
        expect(first?.checks).toEqual([
            {name: 'build', state: 'ok'},
            {name: 'test', state: 'fail'},
            {name: 'e2e', state: 'pending'},
            {name: 'ci/lint', state: 'ok'},
        ]);
        const review = parsePage(page([node({number: 9, author: {login: 'rafa'}})]), true);
        expect(review.next).toBeNull();
        expect(review.pulls[0]?.reviewRequested).toBeTrue();
        expect(review.pulls[0]?.author).toBe('rafa');
    });

    it('aguenta campos nulos na resposta', () => {
        const [only] = parsePage(
            page([
                node({
                    author: null,
                    commits: {nodes: []},
                    reviewDecision: null,
                    changes: {nodes: [{author: null, body: ''}]},
                }),
            ]),
            false,
        ).pulls;
        expect(only?.author).toBe('ghost');
        expect(only?.rollup).toBeNull();
        expect(only?.checks).toEqual([]);
        expect(only?.reviewDecision).toBeNull();
        expect(only?.changesBy).toEqual({author: 'ghost', body: ''});
    });

    it('PR que está nas duas buscas aparece uma vez, como PR meu', () => {
        const mine = parsePage(page([node()]), false).pulls;
        const review = parsePage(page([node(), node({number: 9})]), true).pulls;
        const merged = mergePulls(mine, review);
        expect(merged.map(p => [p.key, p.reviewRequested])).toEqual([
            ['dono/frodo#42', false],
            ['dono/frodo#9', true],
        ]);
    });

    it('erro do GraphQL vira GitHubResponseError com a mensagem', () => {
        const body = JSON.stringify({errors: [{message: 'The listed users and repositories cannot be searched'}]});
        expect(() => parsePage(body, false)).toThrowMatching(
            error => error instanceof GitHubResponseError && error.message === 'The listed users and repositories cannot be searched',
        );
        expect(() => parsePage('{quebrado', false)).toThrowMatching(error => error instanceof GitHubResponseError);
    });

    it('classifica pela ordem de prioridade', () => {
        expect(classify(pr({mergeable: 'CONFLICTING', reviewDecision: 'CHANGES_REQUESTED'}))).toBe('conflict');
        expect(classify(pr({reviewDecision: 'CHANGES_REQUESTED', rollup: 'FAILURE'}))).toBe('changes');
        expect(classify(pr({rollup: 'FAILURE'}))).toBe('ci');
        expect(classify(pr({rollup: 'ERROR'}))).toBe('ci');
        expect(classify(pr({reviewRequested: true, rollup: 'PENDING'}))).toBe('review');
        expect(classify(pr({reviewDecision: 'APPROVED'}))).toBe('ready');
        expect(classify(pr({reviewDecision: 'APPROVED', rollup: null}))).toBe('ready');
        expect(classify(pr({reviewDecision: 'APPROVED', rollup: 'PENDING'}))).toBeNull();
        expect(classify(pr({reviewDecision: 'REVIEW_REQUIRED', rollup: 'PENDING'}))).toBeNull();
    });

    it('mergeable desconhecido herda o anterior e, sem anterior, não é conflito', () => {
        const unknown = pr({mergeable: 'UNKNOWN', reviewDecision: 'APPROVED'});
        expect(classifyAll([unknown], []).map(p => p.kind)).toEqual(['ready']);
        const before = classified({kind: 'conflict', mergeable: 'CONFLICTING'});
        expect(classifyAll([unknown], [before]).map(p => p.kind)).toEqual(['conflict']);
    });

    it('ordena por prioridade e depois pelo mais recente, sem os que não precisam de nada', () => {
        const sorted = classifyAll(
            [
                pr({key: 'a#1', reviewDecision: 'APPROVED', updatedAt: 9}),
                pr({key: 'a#2', mergeable: 'CONFLICTING', updatedAt: 1}),
                pr({key: 'a#3', mergeable: 'CONFLICTING', updatedAt: 5}),
                pr({key: 'a#4', rollup: 'PENDING'}),
            ],
            [],
        );
        expect(sorted.map(p => p.key)).toEqual(['a#3', 'a#2', 'a#1']);
    });

    it('descreve o conflito com o comando de rebase', () => {
        expect(prDetail(classified({kind: 'conflict', behindBy: 3}))).toEqual({
            title: 'Conflito com master',
            body: 'A master recebeu 3 commits depois que o PR foi aberto.',
            command: 'git fetch origin && git rebase origin/master',
        });
        expect(prDetail(classified({kind: 'conflict', behindBy: 1})).body).toBe('A master recebeu 1 commit depois que o PR foi aberto.');
        expect(prDetail(classified({kind: 'conflict', behindBy: null})).body).toBe('');
    });

    it('descreve as alterações pedidas com o texto da review', () => {
        const changes = (body: string): ClassifiedPr => classified({kind: 'changes', changesBy: {author: 'bia', body}});
        expect(prDetail(changes('Falta um teste.'))).toEqual({title: '@bia pediu alterações', body: '“Falta um teste.”', command: null});
        expect(prDetail(changes('')).body).toBe('Sem comentário geral; veja os comentários no código.');
        expect(prDetail(changes('x'.repeat(300))).body).toBe(`“${'x'.repeat(200)}…”`);
    });

    it('descreve CI, revisão e pronto para merge', () => {
        const ci = classified({
            kind: 'ci',
            checks: [
                {name: 'build', state: 'ok'},
                {name: 'test', state: 'fail'},
            ],
        });
        expect(prDetail(ci).title).toBe('O check test falhou');
        const two = classified({
            kind: 'ci',
            checks: [
                {name: 'a', state: 'fail'},
                {name: 'b', state: 'fail'},
            ],
        });
        expect(prDetail(two).title).toBe('2 checks falharam');
        const review = classified({kind: 'review', author: 'rafa', files: 5, rollup: 'SUCCESS'});
        expect(prDetail(review)).toEqual({
            title: '@rafa pediu sua revisão',
            body: '5 arquivos alterados. Os checks passaram.',
            command: null,
        });
        expect(prDetail(classified({kind: 'review', author: 'lu', files: 1, rollup: 'PENDING'})).body).toBe('1 arquivo alterado.');
        expect(prDetail(classified({kind: 'ready', approvedBy: 'rafa'}))).toEqual({
            title: 'Aprovado por @rafa',
            body: 'Todos os checks passaram e não há conflitos.',
            command: null,
        });
    });

    it('botão principal abre o lugar certo do PR', () => {
        const url = 'https://github.com/dono/frodo/pull/42';
        expect(primaryAction(classified({kind: 'conflict'}))).toEqual({label: 'Abrir no GitHub', url});
        expect(primaryAction(classified({kind: 'changes'}))).toEqual({label: 'Ver alterações pedidas', url});
        expect(primaryAction(classified({kind: 'ci'}))).toEqual({label: 'Ver logs do CI', url: `${url}/checks`});
        expect(primaryAction(classified({kind: 'review'}))).toEqual({label: 'Revisar agora', url: `${url}/files`});
        expect(primaryAction(classified({kind: 'ready'}))).toEqual({label: 'Abrir no GitHub', url});
    });

    it('títulos de alerta usam o nome curto do repositório', () => {
        expect(shortRef(pr())).toBe('frodo#42');
        expect(alertTitle(classified({kind: 'conflict'}))).toBe('frodo#42 está com conflito');
        expect(alertTitle(classified({kind: 'changes'}))).toBe('frodo#42 tem alterações pedidas');
        expect(alertTitle(classified({kind: 'ci'}))).toBe('frodo#42 está com CI falhando');
        expect(alertTitle(classified({kind: 'review', author: 'rafa'}))).toBe('@rafa pediu sua revisão em frodo#42');
    });

    it('lê o token do hosts.yml do gh', () => {
        const yaml = 'github.com:\n    users:\n        eu:\n            oauth_token: gho_velho\n    oauth_token: gho_y\n    user: eu\n';
        expect(tokenFromHostsYaml(yaml)).toBe('gho_y');
        expect(tokenFromHostsYaml('github.com:\n    users:\n        eu:\n            oauth_token: gho_z\n')).toBe('gho_z');
        expect(tokenFromHostsYaml('github.com:\n    user: eu\n')).toBeNull();
        expect(tokenFromHostsYaml('outro.com:\n    oauth_token: x\n')).toBeNull();
    });

    it('aceita só repositório no formato dono/nome', () => {
        expect(isRepoName('dono/frodo')).toBeTrue();
        expect(isRepoName('time/flux-web.v2')).toBeTrue();
        expect(isRepoName('frodo')).toBeFalse();
        expect(isRepoName('a/b/c')).toBeFalse();
        expect(isRepoName(' a/b')).toBeFalse();
    });

    it('pergunta quanto a base andou só para os PRs em conflito', () => {
        const a = classified({key: 'dono/frodo#42', kind: 'conflict', head: 'feat/"x"'});
        const b = classified({key: 'time/api#9', repo: 'time/api', kind: 'conflict', base: 'main', head: 'fix/y'});
        const body = JSON.parse(compareBody([a, b])) as {query: string};
        expect(body.query).toContain('c0: repository(owner: "dono", name: "frodo")');
        expect(body.query).toContain('ref(qualifiedName: "refs/heads/master")');
        expect(body.query).toContain('compare(headRef: "feat/\\"x\\"")');
        expect(body.query).toContain('c1: repository(owner: "time", name: "api")');
        const answer = JSON.stringify({data: {c0: {ref: {compare: {behindBy: 3}}}, c1: null}});
        expect([...parseCompare(answer, [a, b])]).toEqual([['dono/frodo#42', 3]]);
        expect([...parseCompare('{quebrado', [a])]).toEqual([]);
    });
});
