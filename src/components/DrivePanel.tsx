import { Bot, Gamepad2, Hand, Power, PowerOff, Rabbit, ShieldCheck, Turtle } from "lucide-react";

import { useApp } from "../AppContext";
import { useDriveMode } from "../hooks/useDriveMode";
import { teleopHint, useTeleop } from "../hooks/useTeleop";
import { DRIVE_MODE, DRIVE_MODE_DETAIL, DRIVE_MODE_LABEL, DRIVE_MODES, guardStatus, reasonText } from "../lib/driveMode";
import { SPEED_PRESETS } from "../lib/teleop";
import { useRos } from "../ros/RosProvider";
import { Joystick } from "./Joystick";
import { StatusChip } from "./StatusChip";

const MODE_ICON = {
    [DRIVE_MODE.MANUAL]: <Hand size={16} />,
    [DRIVE_MODE.ASSISTED]: <ShieldCheck size={16} />,
    [DRIVE_MODE.AUTOMATIC]: <Bot size={16} />,
};

/**
 * The rover's driving mode (Manual / Assisted / Automatic). Shared by every browser: the
 * rover owns it, and this only asks for a change; the selection moves when drive_mode says so.
 */
export const DriveModeSelector = ({ compact = false }: { compact?: boolean }) => {
    const { connected } = useRos();
    const driveMode = useDriveMode();
    const reason = reasonText(driveMode.message);
    return (
        <div className="drive-mode">
            <div className={`segmented ${compact ? "segmented-sm" : ""}`} role="radiogroup" aria-label="Driving mode">
                {DRIVE_MODES.map((m) => {
                    const on = driveMode.mode === m;
                    return (
                        <button key={m} role="radio" aria-checked={on} title={DRIVE_MODE_DETAIL[m]}
                            className={on ? `seg-on ${m === DRIVE_MODE.MANUAL ? "seg-accent" : ""}` : ""}
                            disabled={!connected || driveMode.requesting || driveMode.mode === null}
                            onClick={() => { if (!on) void driveMode.requestMode(m) }}>
                            {!compact && MODE_ICON[m]}{DRIVE_MODE_LABEL[m]}
                        </button>
                    );
                })}
            </div>
            {driveMode.error && <p className="hint error-text">{driveMode.error}</p>}
            {!compact && !driveMode.error && reason && <p className="hint warn-text">{reason}</p>}
        </div>
    );
};

/** What the lidar is doing to the current mode's commands. */
export const GuardChip = () => {
    const driveMode = useDriveMode();
    const status = guardStatus(driveMode.message);
    return <StatusChip level={status.level} label={status.label} title={status.detail} />;
};

/** This browser's joystick on/off: the deadman arm, local to the page. */
export const JoystickSwitch = () => {
    const { armed, setArmed } = useApp();
    const { connected } = useRos();
    const driveMode = useDriveMode();
    return (
        <div className="segmented segmented-sm" role="radiogroup" aria-label="Joystick">
            <button role="radio" aria-checked={!armed} className={!armed ? "seg-on" : ""}
                onClick={() => setArmed(false)}>
                <PowerOff size={15} />Joystick off
            </button>
            <button role="radio" aria-checked={armed} className={armed ? "seg-on seg-accent" : ""}
                disabled={!connected || driveMode.mode === null} onClick={() => setArmed(true)}>
                <Power size={15} />Joystick on
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

/** Driving on the Drive tab. The publish loop itself lives in TeleopProvider. */
export const DrivePanel = () => {
    const { connected } = useRos();
    const teleop = useTeleop();
    const { twist } = teleop;

    return (
        <section className="card">
            <div className="card-head">
                <h3 className="card-title"><Gamepad2 size={15} />Drive</h3>
                <GuardChip />
            </div>
            <DriveModeSelector />
            <JoystickSwitch />
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
