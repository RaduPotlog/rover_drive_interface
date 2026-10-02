import { useCallback, useEffect, useRef } from "react";

import { useApp } from "../AppContext";
import type { Pose2D } from "../lib/geometry";
import { nsName } from "../lib/namespace";
import { findMe } from "../lib/relocalize";
import {
    type Confirm,
    type IndoorSnapshot,
    mapDeleted,
    mapLoaded,
    mappingStarted,
    mapSaved,
    placeDeleted,
    placeSaved,
    waitFor,
} from "../lib/reconcile";
import type { LocalizationStateMsg, MapList, PlaceList, PlaceMsg, Result } from "../lib/rosTypes";
import { ServiceTimeoutError } from "../ros";
import { useRos } from "../ros/RosProvider";
import { useTopic } from "./useTopic";

// How long a call waits for its reply, then how much longer for the latched topics to show
// the outcome (see lib/reconcile.ts) before it reports "no reply".
const REPLY_TIMEOUT_MS = 8000;
const CONFIRM_WAIT_MS = 12000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** rover_indoor_nav_manager: maps, places and the SLAM <-> AMCL switch. */
export const useIndoorNav = () => {
    const { config } = useApp();
    const { ros, connected } = useRos();
    const ns = config.namespace;
    const state = useTopic<LocalizationStateMsg>(nsName(ns, "localization_state"), "rover_msgs/msg/LocalizationState");
    const maps = useTopic<MapList>(nsName(ns, "maps"), "rover_msgs/msg/MapList");
    const places = useTopic<PlaceList>(nsName(ns, "places"), "rover_msgs/msg/PlaceList");

    // The newest latched state, read while a timed-out call waits for its outcome.
    const snapshot = useRef<IndoorSnapshot>({ maps: null, places: null, state: null });
    useEffect(() => {
        snapshot.current = { maps: maps.message, places: places.message, state: state.message };
    }, [maps.message, places.message, state.message]);

    const call = useCallback(async <Res extends Result>(
        service: string, request: unknown, done: string, confirm: Confirm, timeoutMs = REPLY_TIMEOUT_MS,
    ): Promise<Res> => {
        if (!ros || !connected) throw new Error("Not connected");
        const before = snapshot.current;
        try {
            const res = await ros.callService<unknown, Res>(nsName(ns, service), request, timeoutMs);
            if (!res.success) throw new Error(res.message);
            return res;
        } catch (e) {
            // A real refusal or bridge failure stands; only a missing reply is worth checking.
            if (!(e instanceof ServiceTimeoutError)) throw e;
            const confirmed = await waitFor(() => confirm(snapshot.current, before), CONFIRM_WAIT_MS, sleep);
            if (confirmed === null) {
                throw new Error("No reply from the rover - the link is slow. Check the list before trying again.");
            }
            return {
                success: true,
                message: `${done} The rover's reply was slow (weak link).`,
                ...(typeof confirmed === "object" ? { place: confirmed } : {}),
            } as Res;
        }
    }, [ros, connected, ns]);

    return {
        available: state.message !== null,
        state: state.message,
        maps: maps.message,
        places: places.message?.places ?? [],
        startMapping: () => call("start_mapping", {}, "Mapping started.", mappingStarted()),
        // The manager waits up to save_map_timeout + 10 s for map_saver before it answers.
        saveMap: (name: string) => call("save_map", { name }, `Map '${name}' saved.`, mapSaved(name), 20000),
        loadMap: (name: string, pose?: Pose2D) => call("load_map", {
            name,
            set_initial_pose: pose !== undefined,
            x: pose?.x ?? 0,
            y: pose?.y ?? 0,
            theta: pose?.theta ?? 0,
        }, `Localizing on '${name}'.`, mapLoaded(name)),
        deleteMap: (name: string) => call("delete_map", { name }, `Map '${name}' deleted.`, mapDeleted(name)),
        savePlace: (place: Omit<PlaceMsg, "map_name"> & { map_name?: string }) =>
            call<Result & { place: PlaceMsg }>(
                "save_place", { place: { map_name: "", ...place } }, `Saved '${place.name}'.`, placeSaved(place)),
        deletePlace: (id: string) => call("delete_place", { id }, "Place deleted.", placeDeleted(id)),
        // AMCL's own std_srvs/Empty services, not the manager's.
        findMe: async () => {
            if (!ros || !connected) throw new Error("Not connected");
            await findMe({
                call: (service) => ros.callService(nsName(ns, service), {}, 5000),
                sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            });
            return { success: true, message: "Searching the whole map - drive a few metres slowly." };
        },
    };
};

export type IndoorNav = ReturnType<typeof useIndoorNav>;
