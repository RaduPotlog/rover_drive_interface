// Over a weak link (a remote browser on WireGuard), foxglove_bridge queues a service reply
// behind the map, costmap and scan data on the one websocket, and the call can time out after
// the rover has already done it. The indoor manager's latched topics (maps, places,
// localization_state) carry the outcome too, so a timed-out call is checked against them
// instead of being reported as a failure (and retried, which would duplicate a new place).

import { LOCALIZATION_MODE, type LocalizationStateMsg, type MapList, type PlaceList, type PlaceMsg } from "./rosTypes";

export interface IndoorSnapshot {
    maps: MapList | null;
    places: PlaceList | null;
    state: LocalizationStateMsg | null;
}

/**
 * Whether `now` shows the call took effect, given the snapshot from when it was sent.
 * Returns what the call would have returned (or true), or null while it does not.
 */
export type Confirm<T = unknown> = (now: IndoorSnapshot, before: IndoorSnapshot) => T | null;

const POSE_TOLERANCE = 1e-3; // m and rad; the manager stores the pose it was sent

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

const samePose = (a: Pick<PlaceMsg, "x" | "y" | "theta">, b: Pick<PlaceMsg, "x" | "y" | "theta">) =>
    Math.abs(a.x - b.x) <= POSE_TOLERANCE && Math.abs(a.y - b.y) <= POSE_TOLERANCE && angleDiff(a.theta, b.theta) <= POSE_TOLERANCE;

const hasMap = (s: IndoorSnapshot, name: string) => s.maps?.maps.some((m) => m.name === name) ?? false;

export const mapDeleted = (name: string): Confirm<true> => (now) =>
    now.maps && !hasMap(now, name) ? true : null;

export const mapSaved = (name: string): Confirm<true> => (now, before) =>
    hasMap(now, name) && !hasMap(before, name) ? true : null;

export const mapLoaded = (name: string): Confirm<true> => (now, before) =>
    now.state?.mode === LOCALIZATION_MODE.LOCALIZATION && now.state.map_name === name && now.state !== before.state
        ? true : null;

export const mappingStarted = (): Confirm<true> => (now, before) =>
    now.state?.mode === LOCALIZATION_MODE.MAPPING && now.state !== before.state ? true : null;

/** A new place (empty id) or an update of an existing one (rename). Yields the stored place. */
export const placeSaved = (place: Pick<PlaceMsg, "id" | "name" | "x" | "y" | "theta">): Confirm<PlaceMsg> =>
    (now, before) => {
        const places = now.places?.places ?? [];
        if (place.id) {
            return places.find((p) => p.id === place.id && p.name === place.name && samePose(p, place)) ?? null;
        }
        const known = new Set((before.places?.places ?? []).map((p) => p.id));
        return places.find((p) => !known.has(p.id) && p.name === place.name && samePose(p, place)) ?? null;
    };

export const placeDeleted = (id: string): Confirm<true> => (now) =>
    now.places && !now.places.places.some((p) => p.id === id) ? true : null;

/** Polls `check` until it yields a value or `timeoutMs` passes; null on timeout. */
export const waitFor = async <T>(
    check: () => T | null,
    timeoutMs: number,
    sleep: (ms: number) => Promise<void>,
    now: () => number = Date.now,
    intervalMs = 250,
): Promise<T | null> => {
    const end = now() + timeoutMs;
    for (;;) {
        const value = check();
        if (value !== null) return value;
        if (now() >= end) return null;
        await sleep(intervalMs);
    }
};
