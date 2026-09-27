import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useApp } from "../AppContext";
import { DRIVE_MODE, DRIVE_MODE_LABEL, type DriveModeId, GUARD } from "../lib/driveMode";
import { firstPad, padToStick } from "../lib/gamepad";
import { nsFrame, nsName } from "../lib/namespace";
import {
    isZeroTwist,
    mayPublish,
    shouldPublishTwist,
    SPEED_PRESETS,
    type SpeedPreset,
    type StickInput,
    stickToTwist,
    type Twist2D,
    twistStamped,
    ZERO_BURST_TICKS,
    ZERO_TWIST,
} from "../lib/teleop";
import { Topic } from "../ros";
import { useRos } from "../ros/RosProvider";
import { useDriveMode } from "./useDriveMode";
import { usePageActive } from "./usePageActive";

const PUBLISH_PERIOD_MS = 100; // 10 Hz: 3 periods per twist_mux's 0.3 s timeout
const PRESET_KEY = "drive.speedPreset";

const loadPreset = () => {
    try {
        return localStorage.getItem(PRESET_KEY) ?? "slow";
    } catch {
        return "slow";
    }
};

export interface Teleop {
    /** This browser's joystick is on. */
    armed: boolean;
    /** The loop is publishing: armed, bridge up, page visible and focused. */
    publishing: boolean;
    /** The rover's driving mode, null while unknown. */
    mode: DriveModeId | null;
    /** The mode's collision monitor is holding the rover (obstacle, or no lidar data). */
    guardStopped: boolean;
    focused: boolean;
    preset: SpeedPreset;
    setPresetId: (id: string) => void;
    /** On-screen stick input; every joystick on the page feeds the same loop. */
    setStick: (s: StickInput) => void;
    twist: Twist2D;
    padActive: boolean;
}

const TeleopContext = createContext<Teleop | null>(null);

export const useTeleop = (): Teleop => {
    const t = useContext(TeleopContext);
    if (!t) throw new Error("useTeleop outside TeleopProvider");
    return t;
};

/**
 * Joystick driving, owned above the tabs so it keeps running whichever tab or joystick is on
 * screen. While the joystick is off nothing is published. While it is on, it publishes
 * teleop_web_cmd_vel_stamped at 10 Hz while the stick is deflected, and rover_drive_mode routes
 * that by the rover's driving mode: straight to the platform in MANUAL, through the lidar
 * collision monitor in ASSISTED, and in AUTOMATIC a moving stick takes over (the rover switches
 * to ASSISTED and cancels the mission). Either way it ends on twist_mux's web-teleop input
 * (priority 8). Releasing the stick sends a short burst of zeros (~300 ms) and then nothing, as
 * the RC teleop does. The RC transmitter (110) and Foxglove (100) override it. On the rover,
 * rover_command_freshness_node drops commands that arrive late (held through a Wi-Fi stall),
 * judged by header.stamp.
 */
export const TeleopProvider = ({ children }: { children: ReactNode }) => {
    const { config, armed, setArmed } = useApp();
    const driveMode = useDriveMode();
    const { ros, connected, session } = useRos();
    const { visible, focused } = usePageActive();
    const [presetId, setPresetId] = useState(loadPreset);
    const [twist, setTwist] = useState<Twist2D>(ZERO_TWIST);
    const [padActive, setPadActive] = useState(false);
    const stick = useRef<StickInput>({ x: 0, y: 0 });

    const publishing = mayPublish({ armed, connected, visible, focused });
    const guard = driveMode.message?.guard;
    const guardStopped = driveMode.mode !== DRIVE_MODE.MANUAL &&
        (guard === GUARD.STOPPED || guard === GUARD.NO_DATA);
    const preset = SPEED_PRESETS.find((p) => p.id === presetId) ?? SPEED_PRESETS[1];
    // Read by the publish loop, so changing speed does not tear the publisher down.
    const fraction = useRef(preset.fraction);
    fraction.current = preset.fraction;

    // Losing the page or the bridge turns the joystick off: the operator must re-arm on purpose.
    useEffect(() => {
        if (armed && (!connected || !visible)) setArmed(false);
    }, [armed, connected, visible, setArmed]);

    useEffect(() => {
        try {
            localStorage.setItem(PRESET_KEY, presetId);
        } catch {
            // per-viewer convenience only
        }
    }, [presetId]);

    useEffect(() => {
        if (!ros || !publishing) {
            setTwist(ZERO_TWIST);
            return;
        }
        const topic = new Topic<ReturnType<typeof twistStamped>>({
            ros,
            name: nsName(config.namespace, "teleop_web_cmd_vel_stamped"),
            messageType: "geometry_msgs/msg/TwistStamped",
        });
        const frame = nsFrame(config.namespace, "base_link");
        const limits = {
            maxLinear: config.maxLinear,
            maxAngular: config.maxAngular,
            maxRimSpeed: config.maxRimSpeed,
            trackWidth: config.trackWidth,
            expoLinear: config.expoLinear,
            expoAngular: config.expoAngular,
        };

        // Starts spent, so arming with the stick centred publishes nothing.
        let zerosSent = ZERO_BURST_TICKS;
        const tick = () => {
            const padStick = padToStick(firstPad());
            setPadActive(padStick !== null);
            const out = stickToTwist(padStick ?? stick.current, fraction.current, limits);
            setTwist(out);
            if (!shouldPublishTwist(out, zerosSent)) return;
            topic.publish(twistStamped(out, frame));
            zerosSent = isZeroTwist(out) ? zerosSent + 1 : 0;
        };
        tick();
        const id = setInterval(tick, PUBLISH_PERIOD_MS);
        return () => {
            clearInterval(id);
            // One explicit stop, then silence: twist_mux falls back to the next input. Skipped
            // once the zero burst is complete, so it doesn't re-take the mux from Nav 2.
            if (zerosSent < ZERO_BURST_TICKS) topic.publish(twistStamped(ZERO_TWIST, frame));
            topic.unadvertise();
        };
    }, [ros, session, publishing, config.namespace, config.maxLinear, config.maxAngular,
        config.maxRimSpeed, config.trackWidth, config.expoLinear, config.expoAngular]);

    const setStick = useCallback((s: StickInput) => { stick.current = s }, []);

    const mode = driveMode.mode;
    const value = useMemo<Teleop>(() => ({
        armed, publishing, mode, guardStopped, focused, preset, setPresetId, setStick, twist, padActive,
    }), [armed, publishing, mode, guardStopped, focused, preset, setStick, twist, padActive]);

    return <TeleopContext.Provider value={value}>{children}</TeleopContext.Provider>;
};

/** One-line status under a joystick. */
export const teleopHint = (t: Teleop, connected: boolean): string =>
    !connected
        ? "Not connected to the rover."
        : t.mode === null
            ? "Driving mode unknown - rover_drive_mode is not running, so the joystick reaches nothing."
            : !t.armed
                ? `Joystick off. Turn it on to drive (${DRIVE_MODE_LABEL[t.mode]}).`
                : !t.focused
                    ? "Paused - click the page to resume driving."
                    : t.mode === DRIVE_MODE.AUTOMATIC
                        ? "Automatic: moving the stick takes over and cancels the mission."
                        : t.guardStopped
                            ? "The lidar guard is holding the rover - steer away, or switch to Manual."
                            : t.padActive
                                ? "Gamepad driving (hold L1/LB)."
                                : "Drag the stick, or hold L1/LB on a gamepad.";
