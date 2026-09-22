import { Gamepad2, Hand, Rabbit, Turtle } from "lucide-react";

import { useApp } from "../AppContext";
import { teleopHint, useTeleop } from "../hooks/useTeleop";
import { SPEED_PRESETS } from "../lib/teleop";
import { useRos } from "../ros/RosProvider";
import { Joystick } from "./Joystick";

/** Neutral / Manual switch, shared by the Drive tab and the map drive widget. */
export const DriveModeSwitch = () => {
    const { driveMode, setDriveMode } = useApp();
    const { connected } = useRos();
    const manual = driveMode === "manual";
    return (
        <div className="segmented" role="radiogroup" aria-label="Drive mode">
            <button role="radio" aria-checked={!manual} className={!manual ? "seg-on" : ""}
                onClick={() => setDriveMode("neutral")}>
                <Hand size={16} />Neutral
            </button>
            <button role="radio" aria-checked={manual} className={manual ? "seg-on seg-accent" : ""}
                disabled={!connected} onClick={() => setDriveMode("manual")}>
                <Gamepad2 size={16} />Manual
            </button>
        </div>
    );
};

export const SpeedPresets = () => {
    const { preset, setPresetId } = useTeleop();
    return (
        <div className="speed-row" role="radiogroup" aria-label="Speed">
            <Turtle size={18} className="speed-icon" aria-hidden />
            <div className="segmented segmented-sm">
                {SPEED_PRESETS.map((p) => (
                    <button key={p.id} role="radio" aria-checked={p.id === preset.id}
                        className={p.id === preset.id ? "seg-on" : ""} onClick={() => setPresetId(p.id)}>
                        {p.label}
                    </button>
                ))}
            </div>
            <Rabbit size={18} className="speed-icon" aria-hidden />
        </div>
    );
};

/** Manual driving on the Drive tab. The publish loop itself lives in TeleopProvider. */
export const DrivePanel = () => {
    const { connected } = useRos();
    const teleop = useTeleop();
    const { twist } = teleop;

    return (
        <section className="card">
            <div className="card-head">
                <h3 className="card-title"><Gamepad2 size={15} />Manual drive</h3>
            </div>
            <DriveModeSwitch />
            <SpeedPresets />

            <div className="joystick-wrap">
                <Joystick disabled={!teleop.publishing} onChange={teleop.setStick} />
                <div className="readouts">
                    <div className="readout">
                        <div className="readout-label">Linear</div>
                        <div className="readout-value">{twist.linear.toFixed(2)}<span className="readout-unit">m/s</span></div>
                    </div>
                    <div className="readout">
                        <div className="readout-label">Angular</div>
                        <div className="readout-value">{twist.angular.toFixed(2)}<span className="readout-unit">rad/s</span></div>
                    </div>
                </div>
            </div>

            <p className="hint">{teleopHint(teleop, connected)}</p>
        </section>
    );
};
