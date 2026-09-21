// The subset of ROS message shapes the UI reads or writes (as decoded by the CDR reader).
import type { Quaternion, Vector3 } from "./geometry";
import type { OccupancyGrid } from "./occupancyGrid";
import type { TransformStamped } from "./tf";

export interface Time { sec: number; nanosec: number }
export interface Header { stamp: Time; frame_id: string }
export interface Pose { position: Vector3; orientation: Quaternion }
export interface PoseStamped { header: Header; pose: Pose }

export interface TFMessage { transforms: TransformStamped[] }
export type { OccupancyGrid };

export interface LaserScan {
    header: Header;
    angle_min: number;
    angle_increment: number;
    range_min: number;
    range_max: number;
    ranges: Float32Array | number[];
}

export interface Path { header: Header; poses: PoseStamped[] }

export interface MissionState {
    mission_id: string;
    state: number;
    current_index: number;
    total: number;
    message: string;
}

export const MISSION_STATE = {
    IDLE: 0,
    RUNNING: 1,
    HELD: 2,
    SUCCEEDED: 3,
    FAILED: 4,
    CANCELLED: 5,
} as const;

export const MISSION_STATE_LABEL: Record<number, string> = {
    0: "Idle",
    1: "Driving",
    2: "Held",
    3: "Arrived",
    4: "Failed",
    5: "Cancelled",
};

export const stampNow = (nowMs = Date.now()): Time => ({
    sec: Math.floor(nowMs / 1000),
    nanosec: (nowMs % 1000) * 1_000_000,
});

/** AMCL's default initial covariance: 0.5 m x/y, ~15 deg yaw. */
export const initialPoseCovariance = (): number[] => {
    const c = new Array(36).fill(0);
    c[0] = 0.25;
    c[7] = 0.25;
    c[35] = 0.06853891945200942;
    return c;
};
