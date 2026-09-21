import { useCallback } from "react";

import { useApp } from "../AppContext";
import type { Pose2D } from "../lib/geometry";
import { nsName } from "../lib/namespace";
import type { LocalizationStateMsg, MapList, PlaceList, PlaceMsg, Result } from "../lib/rosTypes";
import { useRos } from "../ros/RosProvider";
import { useTopic } from "./useTopic";

/** rover_indoor_nav_manager: maps, places and the SLAM <-> AMCL switch. */
export const useIndoorNav = () => {
    const { config } = useApp();
    const { ros, connected } = useRos();
    const ns = config.namespace;
    const state = useTopic<LocalizationStateMsg>(nsName(ns, "localization_state"), "rover_msgs/msg/LocalizationState");
    const maps = useTopic<MapList>(nsName(ns, "maps"), "rover_msgs/msg/MapList");
    const places = useTopic<PlaceList>(nsName(ns, "places"), "rover_msgs/msg/PlaceList");

    const call = useCallback(async <Res extends Result>(service: string, request: unknown, timeoutMs = 8000) => {
        if (!ros || !connected) throw new Error("Not connected");
        const res = await ros.callService<unknown, Res>(nsName(ns, service), request, timeoutMs);
        if (!res.success) throw new Error(res.message);
        return res;
    }, [ros, connected, ns]);

    return {
        available: state.message !== null,
        state: state.message,
        maps: maps.message,
        places: places.message?.places ?? [],
        startMapping: () => call("start_mapping", {}),
        saveMap: (name: string) => call("save_map", { name }, 20000),
        loadMap: (name: string, pose?: Pose2D) => call("load_map", {
            name,
            set_initial_pose: pose !== undefined,
            x: pose?.x ?? 0,
            y: pose?.y ?? 0,
            theta: pose?.theta ?? 0,
        }),
        deleteMap: (name: string) => call("delete_map", { name }),
        savePlace: (place: Omit<PlaceMsg, "map_name"> & { map_name?: string }) =>
            call<Result & { place: PlaceMsg }>("save_place", { place: { map_name: "", ...place } }),
        deletePlace: (id: string) => call("delete_place", { id }),
    };
};

export type IndoorNav = ReturnType<typeof useIndoorNav>;
