import { describe, expect, it } from "vitest";

import {
    type IndoorSnapshot,
    mapDeleted,
    mapLoaded,
    mappingStarted,
    mapSaved,
    placeDeleted,
    placeSaved,
    waitFor,
} from "../src/lib/reconcile";
import { LOCALIZATION_MODE, type MapInfo, type PlaceMsg } from "../src/lib/rosTypes";

const map = (name: string): MapInfo => ({ name, resolution: 0.05, width: 10, height: 10, saved: { sec: 0, nanosec: 0 } });
const place = (id: string, name: string, x = 1, y = 2, theta = 0.5): PlaceMsg => ({ id, name, map_name: "m", x, y, theta });

const snap = (maps: string[], places: PlaceMsg[] = [], state: IndoorSnapshot["state"] = null): IndoorSnapshot => ({
    maps: { maps: maps.map(map), active_map: "" },
    places: { map_name: "m", places },
    state,
});

describe("reconcile a timed-out call against the latched topics", () => {
    it("confirms a deleted map once the list drops it", () => {
        const before = snap(["a", "b"]);
        expect(mapDeleted("a")(before, before)).toBeNull();
        expect(mapDeleted("a")(snap(["b"]), before)).toBe(true);
        expect(mapDeleted("a")({ maps: null, places: null, state: null }, before)).toBeNull();
    });

    it("confirms a saved map only if it is new", () => {
        expect(mapSaved("a")(snap(["a"]), snap([]))).toBe(true);
        expect(mapSaved("a")(snap(["a"]), snap(["a"]))).toBeNull();
    });

    it("confirms a new place by name and pose, ignoring places that were already there", () => {
        const before = snap([], [place("old", "charger")]);
        const req = { id: "", name: "charger", x: 1, y: 2, theta: 0.5 };
        expect(placeSaved(req)(before, before)).toBeNull();
        const stored = place("new", "charger");
        expect(placeSaved(req)(snap([], [place("old", "charger"), stored]), before)).toEqual(stored);
    });

    it("does not confirm a same-named place at another pose", () => {
        const before = snap([], []);
        const req = { id: "", name: "charger", x: 1, y: 2, theta: 0.5 };
        expect(placeSaved(req)(snap([], [place("n", "charger", 5, 2)]), before)).toBeNull();
    });

    it("treats theta that wrapped around pi as the same pose", () => {
        const req = { id: "", name: "dock", x: 1, y: 2, theta: Math.PI };
        expect(placeSaved(req)(snap([], [place("n", "dock", 1, 2, -Math.PI)]), snap([]))).not.toBeNull();
    });

    it("confirms a rename by id and new name", () => {
        const before = snap([], [place("p", "old name")]);
        const req = { id: "p", name: "new name", x: 1, y: 2, theta: 0.5 };
        expect(placeSaved(req)(before, before)).toBeNull();
        expect(placeSaved(req)(snap([], [place("p", "new name")]), before)?.id).toBe("p");
    });

    it("confirms a deleted place once its id is gone", () => {
        const before = snap([], [place("p", "x")]);
        expect(placeDeleted("p")(before, before)).toBeNull();
        expect(placeDeleted("p")(snap([], []), before)).toBe(true);
    });

    it("confirms a map load or SLAM start only on a new state message", () => {
        const loc = { mode: LOCALIZATION_MODE.LOCALIZATION, map_name: "a", message: "" };
        const before = snap([], [], loc);
        expect(mapLoaded("a")(before, before)).toBeNull();
        expect(mapLoaded("a")(snap([], [], { ...loc }), before)).toBe(true);
        expect(mapLoaded("b")(snap([], [], { ...loc }), before)).toBeNull();
        const mappingState = { mode: LOCALIZATION_MODE.MAPPING, map_name: "", message: "" };
        expect(mappingStarted()(snap([], [], mappingState), before)).toBe(true);
    });
});

describe("waitFor", () => {
    it("returns at once when already confirmed", async () => {
        let slept = 0;
        expect(await waitFor(() => 7, 1000, async () => { slept++ })).toBe(7);
        expect(slept).toBe(0);
    });

    it("polls until the value appears", async () => {
        let t = 0;
        let calls = 0;
        const value = await waitFor(() => (++calls >= 3 ? "ok" : null), 1000, async (ms) => { t += ms }, () => t);
        expect(value).toBe("ok");
        expect(t).toBe(500);
    });

    it("gives up after the timeout", async () => {
        let t = 0;
        expect(await waitFor(() => null, 1000, async (ms) => { t += ms }, () => t)).toBeNull();
        expect(t).toBe(1000);
    });
});
