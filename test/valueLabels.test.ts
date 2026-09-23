import { describe, expect, it } from "vitest";

import { booleanMeaning } from "../src/lib/valueLabels";

describe("booleanMeaning", () => {
    it("spells out the safety pins in both directions", () => {
        expect(booleanMeaning("HW E-Stop user button", "True")).toBe("PRESSED");
        expect(booleanMeaning("HW E-Stop user button", "False")).toBe("RELEASED");
        expect(booleanMeaning("SW E-Stop latch status", "true")).toBe("ON");
        expect(booleanMeaning("SW E-Stop latch status", " FALSE ")).toBe("OFF");
    });

    it("labels nothing on a guess", () => {
        expect(booleanMeaning("Some other key", "True")).toBeNull();
        expect(booleanMeaning("HW E-Stop user button", "1")).toBeNull();
        expect(booleanMeaning("HW E-Stop user button", "")).toBeNull();
    });
});
