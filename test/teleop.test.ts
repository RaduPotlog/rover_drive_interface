import { describe, expect, it } from "vitest";

import { padToStick } from "../src/lib/gamepad";
import { applyDeadzone, mayPublish, stickToTwist, twistStamped } from "../src/lib/teleop";

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
