import { describe, expect, it } from "vitest";

import { padToStick } from "../src/lib/gamepad";
import { applyDeadzone, applyExpo, limitRimSpeed, mayPublish, stickToTwist, twistStamped } from "../src/lib/teleop";

const limits = { maxLinear: 1.0, maxAngular: 1.0 };

describe("teleop", () => {
    it("applies the deadzone and rescales", () => {
        expect(applyDeadzone(0.05, 0.1)).toBe(0);
        expect(applyDeadzone(1, 0.1)).toBe(1);
        expect(applyDeadzone(-0.55, 0.1)).toBeCloseTo(-0.5, 9);
    });

    it("maps forward to +linear and right to -angular, scaled by the preset", () => {
        const t = stickToTwist({ x: 1, y: 1 }, 0.5, limits, 0);
        expect(t.linear).toBeCloseTo(0.5, 9);
        expect(t.angular).toBeCloseTo(-0.5, 9);
    });

    it("never exceeds the limits", () => {
        const t = stickToTwist({ x: -3, y: -3 }, 2, { maxLinear: 0.8, maxAngular: 1.2 }, 0);
        expect(t.linear).toBeCloseTo(-0.8, 9);
        expect(t.angular).toBeCloseTo(1.2, 9);
    });

    it("centred stick yields zero", () => {
        const t = stickToTwist({ x: 0.02, y: -0.03 }, 1, limits);
        expect(t.linear).toBe(0);
        expect(t.angular).toBe(0);
    });

    it("deadman: publishes only in manual, connected, visible and focused", () => {
        const base = { manual: true, connected: true, visible: true, focused: true };
        expect(mayPublish(base)).toBe(true);
        expect(mayPublish({ ...base, manual: false })).toBe(false);
        expect(mayPublish({ ...base, connected: false })).toBe(false);
        expect(mayPublish({ ...base, visible: false })).toBe(false);
        expect(mayPublish({ ...base, focused: false })).toBe(false);
    });

    it("stamps TwistStamped with sec/nanosec", () => {
        const msg = twistStamped({ linear: 0.3, angular: -0.1 }, "rover/base_link", 1_700_000_000_250);
        expect(msg.header.stamp).toEqual({ sec: 1_700_000_000, nanosec: 250_000_000 });
        expect(msg.twist.linear.x).toBe(0.3);
        expect(msg.twist.angular.z).toBe(-0.1);
    });

    it("gamepad drives only while the deadman button is held", () => {
        const buttons = Array.from({ length: 8 }, () => ({ pressed: false }));
        expect(padToStick({ axes: [0.5, -1], buttons })).toBeNull();
        buttons[4] = { pressed: true };
        expect(padToStick({ axes: [0.5, -1], buttons })).toEqual({ x: 0.5, y: 1 });
        expect(padToStick(null)).toBeNull();
    });
});

// Port of rover_crsf_teleop's test_rim_speed_limit.cpp: same budget and half track.
describe("limitRimSpeed", () => {
    const BUDGET = 1.7;
    const HALF_TRACK = 0.5;
    const rim = (t: { linear: number; angular: number }) => Math.abs(t.linear) + Math.abs(t.angular) * HALF_TRACK;

    it("leaves a command within the budget unchanged", () => {
        expect(limitRimSpeed({ linear: 0.8, angular: 0.5 }, BUDGET, HALF_TRACK)).toEqual({ linear: 0.8, angular: 0.5 });
    });

    it("scales an over-budget command to the budget and keeps the curvature", () => {
        const out = limitRimSpeed({ linear: 1.5, angular: 2.1 }, BUDGET, HALF_TRACK);
        expect(rim(out)).toBeCloseTo(BUDGET, 12);
        expect(out.angular / out.linear).toBeCloseTo(2.1 / 1.5, 12);
    });

    it("preserves signs", () => {
        const out = limitRimSpeed({ linear: -1.5, angular: 2.1 }, BUDGET, HALF_TRACK);
        expect(out.linear).toBeLessThan(0);
        expect(out.angular).toBeGreaterThan(0);
        expect(rim(out)).toBeCloseTo(BUDGET, 12);
    });

    it("handles pure straight and pure spin", () => {
        expect(limitRimSpeed({ linear: 2.0, angular: 0 }, BUDGET, HALF_TRACK)).toEqual({ linear: BUDGET, angular: 0 });
        const spin = limitRimSpeed({ linear: 0, angular: -5.0 }, BUDGET, HALF_TRACK);
        expect(Object.is(spin.linear, 0)).toBe(true);
        expect(spin.angular).toBeCloseTo(-BUDGET / HALF_TRACK, 12);
    });

    it("keeps zero exactly zero", () => {
        const out = limitRimSpeed({ linear: 0, angular: 0 }, BUDGET, HALF_TRACK);
        expect(Object.is(out.linear, 0) && Object.is(out.angular, 0)).toBe(true);
    });

    it("is disabled by a non-positive budget or track", () => {
        const input = { linear: 1.5, angular: 2.1 };
        for (const out of [limitRimSpeed(input, 0, HALF_TRACK), limitRimSpeed(input, -1, HALF_TRACK), limitRimSpeed(input, BUDGET, 0)]) {
            expect(out).toEqual(input);
        }
    });

    it("is applied by stickToTwist, so full stick with high limits stays within the budget", () => {
        const high = { maxLinear: 1.5, maxAngular: 2.1, maxRimSpeed: BUDGET, trackWidth: 2 * HALF_TRACK };
        const out = stickToTwist({ x: 1, y: 1 }, 1.0, high, 0);
        expect(rim(out)).toBeCloseTo(BUDGET, 12);
        // Today's defaults (1.0 m/s, 1.0 rad/s, 1.0204 m) never reach 1.7 m/s: unchanged.
        const defaults = { maxLinear: 1.0, maxAngular: 1.0, maxRimSpeed: 1.7, trackWidth: 1.0204 };
        expect(stickToTwist({ x: 1, y: 1 }, 1.0, defaults, 0)).toEqual({ linear: 1.0, angular: -1.0 });
    });
});

describe("applyExpo", () => {
    it("is linear at 0 and keeps full deflection at ±1 for any expo", () => {
        expect(applyExpo(0.37, 0)).toBeCloseTo(0.37, 12);
        for (const e of [0, 0.3, 0.5, 1]) {
            expect(applyExpo(1, e)).toBeCloseTo(1, 12);
            expect(applyExpo(-1, e)).toBeCloseTo(-1, 12);
        }
    });

    it("softens small deflections: 30 % stick at 0.5 expo is 16 %", () => {
        expect(applyExpo(0.3, 0.5)).toBeCloseTo(0.1635, 12);
    });

    it("is odd and monotonic", () => {
        let prev = -Infinity;
        for (let v = -1; v <= 1.0001; v += 0.05) {
            const out = applyExpo(v, 0.7);
            expect(applyExpo(-v, 0.7)).toBeCloseTo(-out, 12);
            expect(out).toBeGreaterThan(prev);
            prev = out;
        }
    });

    it("clamps expo to 0..1", () => {
        expect(applyExpo(0.5, 2)).toBeCloseTo(applyExpo(0.5, 1), 12);
        expect(applyExpo(0.5, -1)).toBeCloseTo(0.5, 12);
        expect(applyExpo(0.5, Number.NaN)).toBeCloseTo(0.5, 12);
    });

    it("is applied by stickToTwist: full stick unchanged, half stick softer, zero stays 0", () => {
        const soft = { maxLinear: 1, maxAngular: 1, expoLinear: 0.3, expoAngular: 0.5 };
        expect(stickToTwist({ x: 1, y: 1 }, 1, soft, 0)).toEqual({ linear: 1, angular: -1 });
        const half = stickToTwist({ x: 0.5, y: 0.5 }, 1, soft, 0);
        expect(half.linear).toBeCloseTo(0.3875, 12); // 0.7·0.5 + 0.3·0.125
        expect(half.angular).toBeCloseTo(-0.3125, 12); // 0.5·0.5 + 0.5·0.125
        const zero = stickToTwist({ x: 0, y: 0 }, 1, soft);
        expect(Object.is(zero.linear, 0) && Object.is(zero.angular, 0)).toBe(true);
    });
});
