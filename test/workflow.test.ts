import { describe, expect, it } from "vitest";

import { MAP_NAME, moveStep, removeStep, resolveWorkflow, workflowLabel } from "../src/lib/workflow";

const place = (id: string, name = id) => ({ id, name, map_name: "lab", x: 0, y: 0, theta: 0 });

describe("workflow", () => {
    it("resolves ids in order and drops deleted places", () => {
        const places = [place("a"), place("b"), place("c")];
        expect(resolveWorkflow(["c", "x", "a", "c"], places).map((p) => p.id)).toEqual(["c", "a", "c"]);
    });

    it("moves and removes steps", () => {
        expect(moveStep(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
        expect(moveStep(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
        expect(moveStep(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
        expect(removeStep(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    });

    it("labels and validates names like the manager", () => {
        expect(workflowLabel([place("1", "Dock"), place("2", "Line A")])).toBe("Dock → Line A");
        expect(workflowLabel(Array.from({ length: 20 }, (_, i) => place(String(i), "Station"))).length).toBe(58);
        expect(MAP_NAME.test("warehouse_1-b")).toBe(true);
        expect(MAP_NAME.test("../x")).toBe(false);
    });
});
