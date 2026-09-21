import { describe, expect, it } from "vitest";

import { findMe } from "../src/lib/relocalize";

describe("find me", () => {
    it("reinitializes globally, then forces nomotion updates", async () => {
        const calls: string[] = [];
        await findMe({ call: async (s) => { calls.push(s) }, sleep: async () => {} }, 3, 0);
        expect(calls).toEqual([
            "reinitialize_global_localization",
            "request_nomotion_update",
            "request_nomotion_update",
            "request_nomotion_update",
        ]);
    });

    it("stops at the first failure", async () => {
        const calls: string[] = [];
        const call = async (s: string) => {
            calls.push(s);
            if (s === "reinitialize_global_localization") throw new Error("AMCL not running");
        };
        await expect(findMe({ call, sleep: async () => {} })).rejects.toThrow("AMCL not running");
        expect(calls).toEqual(["reinitialize_global_localization"]);
    });
});
