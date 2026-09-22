// Joystick -> velocity command. Kept free of React and ROS so the scaling, deadzone and
// deadman rules can be unit tested.

export interface SpeedPreset {
    id: string;
    label: string;
    fraction: number;
}

// Tortoise-to-hare, as on the OTTO App speed slider / OutdoorNav sensitivity presets.
export const SPEED_PRESETS: SpeedPreset[] = [
    { id: "crawl", label: "20%", fraction: 0.2 },
    { id: "slow", label: "50%", fraction: 0.5 },
    { id: "normal", label: "80%", fraction: 0.8 },
    { id: "fast", label: "100%", fraction: 1.0 },
];

export interface Limits {
    maxLinear: number; // m/s
    maxAngular: number; // rad/s
    /** Outer-wheel rim speed budget, m/s; 0 or unset disables (see limitRimSpeed). */
    maxRimSpeed?: number;
    /** Effective track width, m (wheel_separation * wheel_separation_multiplier). */
    trackWidth?: number;
}

export interface StickInput {
    /** -1 (left) .. 1 (right) */
    x: number;
    /** -1 (back) .. 1 (forward) */
    y: number;
}

export interface Twist2D {
    linear: number;
    angular: number;
}

export const ZERO_TWIST: Twist2D = { linear: 0, angular: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rescale so the deadzone edge maps to 0 and full deflection to ±1. */
export const applyDeadzone = (v: number, deadzone: number): number => {
    const a = Math.abs(v);
    if (a <= deadzone) return 0;
    return Math.sign(v) * clamp((a - deadzone) / (1 - deadzone), 0, 1);
};

/**
 * Keeps the outer wheel of a skid-steer base within a rim-speed budget - a port of
 * rover_crsf_teleop's limitRimSpeed, so the web joystick and the RC transmitter behave alike.
 *
 * diff_drive limits linear and angular independently, so full forward plus full turn asks the
 * outer wheel for |v| + |w| * halfTrack, which can exceed what the wheel joints allow. When the
 * joint limiter then clips only the outer wheel, the rover turns tighter than the stick asked
 * for. Scaling v and w by one common factor keeps the curvature w/v: the arc is the one
 * commanded, just driven slower.
 *
 * - a command within the budget is returned unchanged;
 * - otherwise v and w are scaled so the rim speed equals the budget;
 * - zero stays exactly zero;
 * - maxRimSpeed <= 0 or halfTrack <= 0 disables the limit.
 */
export const limitRimSpeed = (twist: Twist2D, maxRimSpeed: number, halfTrack: number): Twist2D => {
    if (!(maxRimSpeed > 0) || !(halfTrack > 0)) return twist;
    const rim = Math.abs(twist.linear) + Math.abs(twist.angular) * halfTrack;
    if (rim <= maxRimSpeed) return twist;
    const scale = maxRimSpeed / rim;
    return { linear: twist.linear * scale || 0, angular: twist.angular * scale || 0 };
};

/**
 * Stick deflection to a twist. Forward is +linear; pushing right turns right, which is
 * -angular in ROS (REP-103, z up).
 */
export const stickToTwist = (
    stick: StickInput,
    fraction: number,
    limits: Limits,
    deadzone = 0.08,
): Twist2D => {
    const x = applyDeadzone(clamp(stick.x, -1, 1), deadzone);
    const y = applyDeadzone(clamp(stick.y, -1, 1), deadzone);
    const f = clamp(fraction, 0, 1);
    const twist = {
        linear: y * limits.maxLinear * f,
        angular: -x * limits.maxAngular * f || 0, // no -0 on the wire
    };
    return limitRimSpeed(twist, limits.maxRimSpeed ?? 0, (limits.trackWidth ?? 0) / 2);
};

/**
 * Whether the drive loop may publish at all. Manual mode owns the base only while the page
 * is visible and focused and the bridge is connected; anything else is the deadman letting
 * go, and twist_mux's 0.5 s timeout then stops the rover.
 */
export const mayPublish = (state: {
    manual: boolean;
    connected: boolean;
    visible: boolean;
    focused: boolean;
}): boolean => state.manual && state.connected && state.visible && state.focused;

export const twistStamped = (twist: Twist2D, frameId: string, nowMs = Date.now()) => ({
    header: {
        stamp: { sec: Math.floor(nowMs / 1000), nanosec: (nowMs % 1000) * 1_000_000 },
        frame_id: frameId,
    },
    twist: {
        linear: { x: twist.linear, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: twist.angular },
    },
});
