export interface Credentials {
    readonly accessToken: string;
    readonly refreshToken: string | null;
    readonly expiresAt: number;
    readonly subscriptionType: string | null;
    readonly rateLimitTier: string | null;
}
