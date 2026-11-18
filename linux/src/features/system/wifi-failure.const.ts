export const DEVICE_STATE = {
    UNAVAILABLE: 20,
    DISCONNECTED: 30,
    PREPARE: 40,
    NEED_AUTH: 60,
    SECONDARIES: 90,
    ACTIVATED: 100,
    FAILED: 120,
} as const;

export const PASSWORD_REASONS: readonly number[] = [7, 8, 11];
