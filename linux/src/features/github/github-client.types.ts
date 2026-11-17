import type {GitHubAuthMode} from '../../settings/schema-values.types.js';

export interface GitHubHttpResponse {
    readonly status: number;
    readonly body: string;
}

export interface GitHubBackend {
    token(mode: GitHubAuthMode): Promise<string | null>;
    storeToken(token: string): Promise<void>;
    clearToken(): Promise<void>;
    post(token: string, body: string): Promise<GitHubHttpResponse>;
    destroy(): void;
}
