import { describe, expect, it } from "vitest";

import {
    INITIAL_LINK,
    type LinkState,
    MAX_RESUME_AFTER_MS,
    nextLinkState,
    REFLAP_WINDOW_MS,
    RESUME_AFTER_MS,
} from "../src/lib/link";

const fail = { ok: false } as const;
const good = (latency = 80) => ({ ok: true, latency }) as const;

describe("link state", () => {
    it("reports latency while probes succeed", () => {
        expect(nextLinkState(INITIAL_LINK, good(120), 0)).toMatchObject({ latency: 120, slow: false, paused: false });
    });

    it("tolerates a single lost probe", () => {
        expect(nextLinkState(INITIAL_LINK, fail, 0)).toMatchObject({ slow: false, paused: false, timeouts: 1 });
    });

    it("turns slow and pauses streams after two timeouts in a row", () => {
        let s: LinkState = INITIAL_LINK;
        s = nextLinkState(s, fail, 0);
        s = nextLinkState(s, fail, 2000);
        expect(s).toMatchObject({ slow: true, paused: true, latency: null });
    });

    it("clears slow at once but resumes streams only after a steady good stretch", () => {
        let s: LinkState = { ...INITIAL_LINK, slow: true, paused: true, timeouts: 2 };
        s = nextLinkState(s, good(), 0);
        expect(s).toMatchObject({ slow: false, paused: true, goodSince: 0 });
        s = nextLinkState(s, good(), RESUME_AFTER_MS - 1);
        expect(s.paused).toBe(true);
        s = nextLinkState(s, good(), RESUME_AFTER_MS);
        expect(s).toMatchObject({ paused: false, goodSince: null });
    });

    it("restarts the good stretch when a probe fails again", () => {
        let s: LinkState = { ...INITIAL_LINK, slow: true, paused: true, timeouts: 2 };
        s = nextLinkState(s, good(), 0);
        s = nextLinkState(s, fail, 5000);
        expect(s).toMatchObject({ paused: true, slow: false, goodSince: null });
        s = nextLinkState(s, good(), 6000);
        s = nextLinkState(s, good(), 6000 + RESUME_AFTER_MS - 1);
        expect(s.paused).toBe(true);
    });

    const pauseAt = (s: LinkState, t: number) => nextLinkState(nextLinkState(s, fail, t), fail, t + 2000);
    const resumeFrom = (s: LinkState, t: number) => {
        s = nextLinkState(s, good(), t);
        return nextLinkState(s, good(), t + s.resumeAfterMs);
    };

    it("backs off the resume delay when the link turns slow again soon after resuming", () => {
        let s = pauseAt(INITIAL_LINK, 0);
        s = resumeFrom(s, 4000);
        expect(s.paused).toBe(false);
        const resumedAt = 4000 + RESUME_AFTER_MS;
        s = pauseAt(s, resumedAt + 5000);
        expect(s).toMatchObject({ paused: true, resumeAfterMs: 2 * RESUME_AFTER_MS });
        for (let i = 0; i < 10; i++) s = resumeFrom(pauseAt(s, 0), 0);
        expect(s.resumeAfterMs).toBe(MAX_RESUME_AFTER_MS);
    });

    it("drops back to the base delay once the resumed link has held", () => {
        let s = pauseAt(INITIAL_LINK, 0);
        s = resumeFrom(s, 4000);
        s = pauseAt(s, 20_000);
        expect(s.resumeAfterMs).toBe(2 * RESUME_AFTER_MS);
        s = resumeFrom(s, 30_000);
        const resumedAt = s.resumedAt!;
        s = nextLinkState(s, good(), resumedAt + REFLAP_WINDOW_MS);
        expect(s).toMatchObject({ resumeAfterMs: RESUME_AFTER_MS, resumedAt: null });
        s = pauseAt(s, resumedAt + REFLAP_WINDOW_MS + 1000);
        expect(s.resumeAfterMs).toBe(RESUME_AFTER_MS);
    });
});
