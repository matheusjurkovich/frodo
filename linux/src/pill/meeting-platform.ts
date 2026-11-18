import {MEETING_PLATFORMS} from './meeting-platform.const.js';

export function meetingPlatform(url: string | null): string | null {
    const host = url?.match(/^https?:\/\/([^/:?#]+)/i)?.[1]?.toLowerCase();
    return host === undefined ? null : (MEETING_PLATFORMS[host] ?? null);
}
