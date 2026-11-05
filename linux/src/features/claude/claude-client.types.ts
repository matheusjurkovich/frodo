export interface HttpRequest {
    readonly method: 'GET';
    readonly url: string;
    readonly token: string;
}

export interface HttpResponse {
    readonly status: number;
    readonly body: string;
}

export type Transport = (request: HttpRequest) => Promise<HttpResponse>;

export interface Tier {
    readonly subscriptionType: string | null;
    readonly rateLimitTier: string | null;
}
