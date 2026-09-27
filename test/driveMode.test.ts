import { describe, expect, it } from "vitest";

import {
    canGoTo,
    DRIVE_MODE,
    type DriveModeMsg,
    GUARD,
    goToBlockedReason,
    guardStatus,
    isDriveMode,
    reasonText,
} from "../src/lib/driveMode";

const msg = (mode: number, guard: number, reason = ""): DriveModeMsg => ({
    header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "" },
    mode,
    guard,
    reason,
});

describe("driving mode", () => {
    it("recognises only the three rover_msgs/DriveMode modes", () => {
        expect(isDriveMode(DRIVE_MODE.MANUAL)).toBe(true);
        expect(isDriveMode(DRIVE_MODE.ASSISTED)).toBe(true);
        expect(isDriveMode(DRIVE_MODE.AUTOMATIC)).toBe(true);
        // 0 is deliberately unused on the rover side: a default message is not MANUAL.
        expect(isDriveMode(0)).toBe(false);
        expect(isDriveMode(null)).toBe(false);
    });

    it("sends the rover somewhere only in Automatic", () => {
        expect(canGoTo(DRIVE_MODE.AUTOMATIC)).toBe(true);
        expect(canGoTo(DRIVE_MODE.ASSISTED)).toBe(false);
        expect(canGoTo(DRIVE_MODE.MANUAL)).toBe(false);
        expect(canGoTo(null)).toBe(false);
    });

    it("says why Go to is blocked", () => {
        expect(goToBlockedReason(DRIVE_MODE.AUTOMATIC)).toBeNull();
        expect(goToBlockedReason(DRIVE_MODE.MANUAL)).toMatch(/Automatic/);
        expect(goToBlockedReason(null)).toMatch(/rover_drive_mode/);
    });
});

describe("guard status", () => {
    it("is unknown without a message", () => {
        expect(guardStatus(null).level).toBe("unknown");
    });

    it("warns that Manual has no obstacle check", () => {
        expect(guardStatus(msg(DRIVE_MODE.MANUAL, GUARD.BYPASSED)).level).toBe("warn");
    });

    it("maps each guard state to a level", () => {
        expect(guardStatus(msg(DRIVE_MODE.ASSISTED, GUARD.CLEAR)).level).toBe("ok");
        expect(guardStatus(msg(DRIVE_MODE.ASSISTED, GUARD.SLOWING)).level).toBe("warn");
        expect(guardStatus(msg(DRIVE_MODE.ASSISTED, GUARD.STOPPED)).level).toBe("error");
        expect(guardStatus(msg(DRIVE_MODE.AUTOMATIC, GUARD.NO_DATA)).level).toBe("error");
    });

    it("tells no lidar data apart from an obstacle", () => {
        expect(guardStatus(msg(DRIVE_MODE.ASSISTED, GUARD.NO_DATA)).label).toMatch(/lidar/i);
        expect(guardStatus(msg(DRIVE_MODE.ASSISTED, GUARD.STOPPED)).label).toMatch(/obstacle/i);
    });
});

describe("mode change reason", () => {
    it("explains a takeover and a lost mission manager", () => {
        expect(reasonText(msg(DRIVE_MODE.ASSISTED, GUARD.CLEAR, "operator takeover"))).toMatch(/cancelled/);
        expect(reasonText(msg(DRIVE_MODE.ASSISTED, GUARD.CLEAR, "mission manager lost"))).toMatch(/mission manager/);
    });

    it("stays quiet for ordinary changes", () => {
        expect(reasonText(msg(DRIVE_MODE.ASSISTED, GUARD.CLEAR, "boot default"))).toBeNull();
        expect(reasonText(msg(DRIVE_MODE.MANUAL, GUARD.BYPASSED, "operator request"))).toBeNull();
        expect(reasonText(null)).toBeNull();
    });
});
