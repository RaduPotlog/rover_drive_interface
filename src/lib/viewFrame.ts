// Which fixed frame the map canvas draws in. Normally the map frame, but without a
// map -> odom transform (no lidar, AMCL/SLAM down, pure odom localization) the rover can
// still be shown on odometry alone - it just drifts.
import { nsFrame } from "./namespace";
import type { TfBuffer } from "./tf";

export type ViewFrameMode = "auto" | "map" | "odom";
export type ViewFrameKind = "map" | "odom";

export interface ViewFrame {
    frame: string;
    kind: ViewFrameKind;
}

export const VIEW_FRAME_MODES: ViewFrameMode[] = ["auto", "map", "odom"];

export const nextViewFrameMode = (mode: ViewFrameMode): ViewFrameMode =>
    VIEW_FRAME_MODES[(VIEW_FRAME_MODES.indexOf(mode) + 1) % VIEW_FRAME_MODES.length];

/**
 * The frame to draw in. `mapFrameId` is the map's header.frame_id when a map has arrived.
 * Auto prefers the map frame whenever the rover can be placed in it, falls back to odom,
 * and stays on map when neither resolves (so the "waiting for a map" state is unchanged).
 */
export const resolveViewFrame = (
    mode: ViewFrameMode,
    tf: TfBuffer,
    namespace: string,
    mapFrameId?: string | null,
): ViewFrame => {
    const map: ViewFrame = { frame: mapFrameId || nsFrame(namespace, "map"), kind: "map" };
    const odom: ViewFrame = { frame: nsFrame(namespace, "odom"), kind: "odom" };
    if (mode === "map") return map;
    if (mode === "odom") return odom;
    const base = nsFrame(namespace, "base_link");
    if (tf.lookup(map.frame, base)) return map;
    if (tf.lookup(odom.frame, base)) return odom;
    return map;
};

export const sameViewFrame = (a: ViewFrame | null, b: ViewFrame | null) =>
    a === b || (!!a && !!b && a.frame === b.frame && a.kind === b.kind);
