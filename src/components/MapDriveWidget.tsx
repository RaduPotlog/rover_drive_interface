import { ChevronDown, Gamepad2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { teleopHint, useTeleop } from "../hooks/useTeleop";
import { collapsedAfterModeChange, driveWidgetState } from "../lib/driveWidget";
import { useRos } from "../ros/RosProvider";
import { DriveModeSwitch, SpeedPresets } from "./DrivePanel";
import { Joystick } from "./Joystick";

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
export const MapDriveWidget = ({ tab, mapping }: { tab: string; mapping: boolean }) => {
    const { connected } = useRos();
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
            <button className={`floating map-drive-pill ${teleop.manual ? "manual" : ""}`}
                onClick={() => setCollapsed(false)} title="Show the drive joystick">
                <Gamepad2 size={16} />Drive{teleop.manual ? " · MANUAL" : ""}
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
            <p className="hint">{teleopHint(teleop, connected)}</p>
        </section>
    );
};
