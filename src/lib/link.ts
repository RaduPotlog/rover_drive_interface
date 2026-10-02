// The Link pill and the low-bandwidth mode, driven by the /rosapi/get_time round-trip probe.
// foxglove_bridge sends everything on one websocket, so when a remote browser's link cannot
// keep up, probe replies queue behind topic data and time out: that is the "slow" signal.

/** Consecutive probe timeouts that mark the link slow. */
export const SLOW_AFTER_TIMEOUTS = 2;
/** Good probes needed for this long before the paused streams come back... */
export const RESUME_AFTER_MS = 10_000;
/**
 * ...doubled each time the link turns slow again within REFLAP_WINDOW_MS of a resume (a link
 * that only just carries the paused streams would otherwise flap every ~20 s), up to the cap.
 */
export const MAX_RESUME_AFTER_MS = 160_000;
export const REFLAP_WINDOW_MS = 60_000;

export interface LinkState {
    latency: number | null;
    /** The last probes timed out: the link is congested (or the bridge is not answering). */
    slow: boolean;
    /** Optional streams (scan, costmap overlay) are paused to free the link. */
    paused: boolean;
    timeouts: number;
    /** When probes started succeeding again while paused. */
    goodSince: number | null;
    resumeAfterMs: number;
    /** When the streams last came back, while that may still turn out premature. */
    resumedAt: number | null;
}

export const INITIAL_LINK: LinkState = {
    latency: null, slow: false, paused: false, timeouts: 0, goodSince: null,
    resumeAfterMs: RESUME_AFTER_MS, resumedAt: null,
};

export type ProbeResult = { ok: true; latency: number } | { ok: false };

export const nextLinkState = (prev: LinkState, probe: ProbeResult, now: number): LinkState => {
    if (!probe.ok) {
        const timeouts = prev.timeouts + 1;
        const slow = prev.slow || timeouts >= SLOW_AFTER_TIMEOUTS;
        const repause = slow && !prev.paused;
        const reflap = repause && prev.resumedAt !== null && now - prev.resumedAt < REFLAP_WINDOW_MS;
        return {
            ...prev,
            latency: null, slow, paused: prev.paused || slow, timeouts, goodSince: null,
            resumeAfterMs: reflap ? Math.min(prev.resumeAfterMs * 2, MAX_RESUME_AFTER_MS) : prev.resumeAfterMs,
            resumedAt: repause ? null : prev.resumedAt,
        };
    }
    if (!prev.paused) {
        // Streams back and the link held for a while: the next pause starts from the base delay.
        const settled = prev.resumedAt !== null && now - prev.resumedAt >= REFLAP_WINDOW_MS;
        return {
            ...prev, latency: probe.latency, slow: false, timeouts: 0, goodSince: null,
            resumeAfterMs: settled ? RESUME_AFTER_MS : prev.resumeAfterMs,
            resumedAt: settled ? null : prev.resumedAt,
        };
    }
    const goodSince = prev.goodSince ?? now;
    const resume = now - goodSince >= prev.resumeAfterMs;
    return {
        ...prev, latency: probe.latency, slow: false, timeouts: 0,
        paused: !resume, goodSince: resume ? null : goodSince, resumedAt: resume ? now : prev.resumedAt,
    };
};
