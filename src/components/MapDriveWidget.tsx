import { ChevronDown, Gamepad2, OctagonX, RotateCcw, Unlock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useApp } from "../AppContext";
import { teleopHint, useTeleop } from "../hooks/useTeleop";
import { collapsedAfterModeChange, driveWidgetState } from "../lib/driveWidget";
import { nsName } from "../lib/namespace";
import { needsRecovery, safetyBadge, type SafetySummary } from "../lib/status";
import { useRos } from "../ros/RosProvider";
import { DriveModeSwitch, SpeedPresets } from "./DrivePanel";
import { RESET_E_STOP_CONFIRM, RESET_LATCH_CONFIRM } from "./EStopPanel";
import { Joystick } from "./Joystick";
import { TriggerButton } from "./TriggerButton";

const COLLAPSED_KEY = "drive.mapWidgetCollapsed";

const loadCollapsed = () => {
    try {
        return localStorage.getItem(COLLAPSED_KEY) !== "false";
    } catch {
        return true;
    }
};

/**
 * A compact joystick over the map on the Navigate and Facility tabs, as in IndoorNav: the
 * operator can drive while mapping or placing things without the RC transmitter. It feeds
 * the same TeleopProvider loop as the Drive tab.
 */
export const MapDriveWidget = ({ tab, mapping, safety }: { tab: string; mapping: boolean; safety: SafetySummary }) => {
    const { config } = useApp();
    const { connected } = useRos();
    const blocked = connected && needsRecovery(safety);
    const hw = (name: string) => nsName(config.namespace, `hardware_interface/${name}`);
    const teleop = useTeleop();
    const [collapsed, setCollapsed] = useState(loadCollapsed);
    const wasMapping = useRef(false);

    useEffect(() => {
        setCollapsed((c) => collapsedAfterModeChange(c, wasMapping.current, mapping));
        wasMapping.current = mapping;
    }, [mapping]);

    useEffect(() => {
        try {
            localStorage.setItem(COLLAPSED_KEY, String(collapsed));
        } catch {
            // per-viewer convenience only
        }
    }, [collapsed]);

    const state = driveWidgetState(tab, collapsed);
    if (state === "hidden") return null;

    if (state === "collapsed") {
        return (
            <button className={`floating map-drive-pill ${blocked ? "alert" : teleop.manual ? "manual" : ""}`}
                onClick={() => setCollapsed(false)} title={blocked ? safety.detail : "Show the drive joystick"}>
                {blocked ? <OctagonX size={16} /> : <Gamepad2 size={16} />}
                Drive{blocked ? ` · ${safetyBadge(safety)}` : teleop.manual ? " · MANUAL" : ""}
            </button>
        );
    }

    return (
        <section className="map-drive" aria-label="Map drive">
            <div className="map-drive-head">
                <span className="card-title"><Gamepad2 size={15} />Drive</span>
                <button className="tool-btn" onClick={() => setCollapsed(true)} title="Hide" aria-label="Hide the drive joystick">
                    <ChevronDown size={16} />
                </button>
            </div>
            <DriveModeSwitch />
            <SpeedPresets />
            <div className="map-drive-stick">
                <Joystick size={150} disabled={!teleop.publishing} onChange={teleop.setStick} />
            </div>
            <div className="map-drive-readout">
                {teleop.twist.linear.toFixed(2)} m/s · {teleop.twist.angular.toFixed(2)} rad/s
            </div>
            {blocked && (
                <div className="map-drive-safety" title={safety.detail}>
                    <div className="map-drive-safety-label"><OctagonX size={14} />{safety.label} - reset to drive</div>
                    <div className="map-drive-safety-btns">
                        <TriggerButton service={hw("sw_user_e_stop_reset")} label="Reset e-stop"
                            icon={<RotateCcw size={14} />} className="btn btn-sm" confirmText={RESET_E_STOP_CONFIRM} />
                        <TriggerButton service={hw("sw_e_stop_latch_reset")} label="Reset latch"
                            icon={<Unlock size={14} />} className="btn btn-sm" confirmText={RESET_LATCH_CONFIRM} />
                    </div>
                </div>
            )}
            <p className="hint">{teleopHint(teleop, connected)}</p>
        </section>
    );
};
