import { describe, expect, it } from "vitest";

import { collapsedAfterModeChange, driveWidgetState } from "../src/lib/driveWidget";

describe("map drive widget", () => {
    it("is hidden on the Drive tab, which has the full joystick", () => {
        expect(driveWidgetState("drive", false)).toBe("hidden");
        expect(driveWidgetState("drive", true)).toBe("hidden");
    });

    it("follows the viewer's choice on the Navigate and Facility tabs", () => {
        expect(driveWidgetState("facility", false)).toBe("expanded");
        expect(driveWidgetState("navigate", true)).toBe("collapsed");
    });

    it("opens when mapping starts, and only then", () => {
        expect(collapsedAfterModeChange(true, false, true)).toBe(false);
        expect(collapsedAfterModeChange(true, true, true)).toBe(true); // collapsed again while mapping
        expect(collapsedAfterModeChange(true, true, false)).toBe(true);
        expect(collapsedAfterModeChange(false, true, false)).toBe(false);
    });
});
