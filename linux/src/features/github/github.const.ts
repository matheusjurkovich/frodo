import type {Mergeable, PrKind, ReviewDecision, Rollup} from './github.types.js';

export const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

export const PR_KINDS: readonly PrKind[] = ['conflict', 'changes', 'ci', 'review', 'ready'];

export const KIND_LABELS: Record<PrKind, string> = {
    conflict: 'Conflito',
    changes: 'Alterações pedidas',
    ci: 'CI falhou',
    review: 'Revisão pedida a você',
    ready: 'Pronto para merge',
};

export const MERGEABLE: readonly Mergeable[] = ['MERGEABLE', 'CONFLICTING', 'UNKNOWN'];

export const DECISIONS: readonly ReviewDecision[] = ['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'];

export const ROLLUPS: readonly Rollup[] = ['SUCCESS', 'FAILURE', 'ERROR', 'PENDING', 'EXPECTED'];

export const CHANGES_BODY_MAX = 200;

export const SEARCH_BASE = 'is:pr is:open archived:false';

export const FAILED_CONCLUSIONS = ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'];

export const PAGE_SIZE = 20;

export const MAX_PAGES = 5;

export const GITHUB_QUERY = `
query Frodo($q: String!, $after: String) {
  viewer { login }
  search(query: $q, type: ISSUE, first: ${PAGE_SIZE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ...Pr }
  }
}
fragment Pr on PullRequest {
  number
  title
  url
  headRefName
  baseRefName
  author { login }
  repository { nameWithOwner }
  additions
  deletions
  changedFiles
  comments { totalCount }
  updatedAt
  mergeable
  reviewDecision
  changes: reviews(last: 1, states: [CHANGES_REQUESTED]) { nodes { author { login } body } }
  approved: reviews(last: 1, states: [APPROVED]) { nodes { author { login } } }
  commits(last: 1) {
    nodes {
      commit {
        statusCheckRollup {
          state
          contexts(first: 20) {
            nodes {
              __typename
              ... on CheckRun { name status conclusion }
              ... on StatusContext { context state }
            }
          }
        }
      }
    }
  }
}`;
