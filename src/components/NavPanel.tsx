import { Navigation, Square } from "lucide-react";
import { useState } from "react";

import { useApp } from "../AppContext";
import { useNow } from "../hooks/useTopic";
import type { Pose2D } from "../lib/geometry";
import { MISSION_STATE, MISSION_STATE_LABEL, type MissionState } from "../lib/rosTypes";
import type { Level } from "../lib/status";
import { StatusChip } from "./StatusChip";

const missionLevel = (m: MissionState | null): Level => {
    if (!m) return "unknown";
    switch (m.state) {
        case MISSION_STATE.RUNNING: return "ok";
        case MISSION_STATE.HELD: return "warn";
        case MISSION_STATE.FAILED: return "error";
        case MISSION_STATE.SUCCEEDED: return "ok";
        default: return "unknown";
    }
};

export const isActive = (m: MissionState | null) =>
    m !== null && (m.state === MISSION_STATE.RUNNING || m.state === MISSION_STATE.HELD);

export const NavPanel = ({ mission, robotPose, onStop, stopError }: {
    mission: MissionState | null;
    robotPose: Pose2D | null;
    onStop: () => void;
    stopError: string | null;
}) => {
    const { driveMode } = useApp();
    useNow(1000);
    const [showDetail, setShowDetail] = useState(false);
    const active = isActive(mission);

    return (
        <section className="card">
            <div className="card-head"><h3 className="card-title"><Navigation size={15} />Navigate</h3></div>
            <div className="nav-status">
                <StatusChip
                    level={missionLevel(mission)}
                    label={mission ? MISSION_STATE_LABEL[mission.state] ?? "?" : "No mission manager"}
                    title={mission?.message || undefined}
                />
                {mission && mission.total > 0 && (
                    <span className="muted">
                        {mission.mission_id} · {Math.min(mission.current_index + 1, mission.total)}/{mission.total}
                    </span>
                )}
            </div>
            {mission?.state === MISSION_STATE.HELD && (
                <p className="hint warn-text">Held: the motion lock is engaged or the lidar is unhealthy. It resumes on its own.</p>
            )}
            {mission?.state === MISSION_STATE.FAILED && mission.message && (
                <p className="hint error-text">{mission.message}</p>
            )}
            <button className="btn btn-danger btn-wide" disabled={!active} onClick={onStop}>
                <Square size={16} fill="currentColor" />Stop
            </button>
            {stopError && <p className="hint error-text">{stopError}</p>}
            <p className="hint">
                {driveMode === "manual"
                    ? "Manual driving is on - switch to Neutral to send the rover somewhere."
                    : "Pick “Go to” on the map, click the destination and drag the final heading."}
            </p>
            <button className="linklike" onClick={() => setShowDetail(!showDetail)}>
                {showDetail ? "Hide" : "Show"} rover pose
            </button>
            {showDetail && (
                <p className="mono">
                    {robotPose
                        ? `x ${robotPose.x.toFixed(2)} m · y ${robotPose.y.toFixed(2)} m · θ ${(robotPose.theta * 180 / Math.PI).toFixed(0)}°`
                        : "Not localized (no map → base_link transform)"}
                </p>
            )}
        </section>
    );
};
