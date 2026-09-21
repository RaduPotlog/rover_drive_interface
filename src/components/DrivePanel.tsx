import { Gamepad2, Hand, Rabbit, Turtle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useApp } from "../AppContext";
import { usePageActive } from "../hooks/usePageActive";
import { firstPad, padToStick } from "../lib/gamepad";
import { nsFrame, nsName } from "../lib/namespace";
import {
    mayPublish,
    SPEED_PRESETS,
    type StickInput,
    stickToTwist,
    type Twist2D,
    twistStamped,
    ZERO_TWIST,
} from "../lib/teleop";
import { Topic } from "../ros";
import { useRos } from "../ros/RosProvider";
import { Joystick } from "./Joystick";

const PUBLISH_PERIOD_MS = 100; // 10 Hz, well inside twist_mux's 0.5 s timeout
const PRESET_KEY = "drive.speedPreset";

const loadPreset = () => {
    try {
        return localStorage.getItem(PRESET_KEY) ?? "slow";
    } catch {
        return "slow";
    }
};

/**
 * Manual driving. In NEUTRAL nothing is published and Nav 2 (twist_mux priority 5) or the
 * RC transmitter drive as usual. In MANUAL this panel publishes on
 * teleop_foxglove_cmd_vel_stamped (priority 100) at 10 Hz - zeros while the stick is
 * centred, so the web UI holds the base - until the deadman lets go.
 */
export const DrivePanel = () => {
    const { config, driveMode, setDriveMode } = useApp();
    const { ros, connected, session } = useRos();
    const { visible, focused } = usePageActive();
    const [presetId, setPresetId] = useState(loadPreset);
    const [twist, setTwist] = useState<Twist2D>(ZERO_TWIST);
    const [padActive, setPadActive] = useState(false);
    const stick = useRef<StickInput>({ x: 0, y: 0 });

    const manual = driveMode === "manual";
    const publishing = mayPublish({ manual, connected, visible, focused });
    const preset = SPEED_PRESETS.find((p) => p.id === presetId) ?? SPEED_PRESETS[1];
    // Read by the publish loop, so changing speed does not tear the publisher down.
    const fraction = useRef(preset.fraction);
    fraction.current = preset.fraction;

    // Losing the page or the bridge drops back to Neutral: the operator must re-arm on purpose.
    useEffect(() => {
        if (manual && (!connected || !visible)) setDriveMode("neutral");
    }, [manual, connected, visible, setDriveMode]);

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
            name: nsName(config.namespace, "teleop_foxglove_cmd_vel_stamped"),
            messageType: "geometry_msgs/msg/TwistStamped",
        });
        const frame = nsFrame(config.namespace, "base_link");
        const limits = { maxLinear: config.maxLinear, maxAngular: config.maxAngular };

        const tick = () => {
            const padStick = padToStick(firstPad());
            setPadActive(padStick !== null);
            const out = stickToTwist(padStick ?? stick.current, fraction.current, limits);
            setTwist(out);
            topic.publish(twistStamped(out, frame));
        };
        tick();
        const id = setInterval(tick, PUBLISH_PERIOD_MS);
        return () => {
            clearInterval(id);
            // One explicit stop, then silence: twist_mux falls back to the next input.
            topic.publish(twistStamped(ZERO_TWIST, frame));
            topic.unadvertise();
        };
    }, [ros, session, publishing, config.namespace, config.maxLinear, config.maxAngular]);

    return (
        <section className="card">
            <div className="card-head">
                <h3 className="card-title"><Gamepad2 size={15} />Manual drive</h3>
            </div>
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

            <div className="joystick-wrap">
                <Joystick disabled={!publishing} onChange={(s) => { stick.current = s }} />
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

            <p className="hint">
                {!connected
                    ? "Not connected to the rover."
                    : !manual
                        ? "Neutral: the web UI is not driving. Select Manual to take control."
                        : !focused
                            ? "Paused - click the page to resume driving."
                            : padActive
                                ? "Gamepad driving (hold L1/LB)."
                                : "Drag the stick, or hold L1/LB on a gamepad."}
            </p>
        </section>
    );
};
