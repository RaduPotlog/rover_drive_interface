// Planar geometry. Indoor navigation happens on a 2D map, so every pose the UI handles
// is (x, y, yaw); 3D transforms from TF are projected onto the plane.

export interface Quaternion { x: number; y: number; z: number; w: number }
export interface Vector3 { x: number; y: number; z: number }

export interface Pose2D {
    x: number;
    y: number;
    theta: number;
}

export const IDENTITY: Pose2D = { x: 0, y: 0, theta: 0 };

export const normalizeAngle = (angle: number): number => {
    const a = Math.atan2(Math.sin(angle), Math.cos(angle));
    // atan2 returns (-pi, pi]; fold -pi into pi so the result is stable.
    return a === -Math.PI ? Math.PI : a;
};

export const yawFromQuaternion = (q: Quaternion): number =>
    Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));

export const quaternionFromYaw = (yaw: number): Quaternion => ({
    x: 0,
    y: 0,
    z: Math.sin(yaw / 2),
    w: Math.cos(yaw / 2),
});

/** a ∘ b: the pose b expressed in a's parent frame. */
export const compose = (a: Pose2D, b: Pose2D): Pose2D => {
    const c = Math.cos(a.theta);
    const s = Math.sin(a.theta);
    return {
        x: a.x + c * b.x - s * b.y,
        y: a.y + s * b.x + c * b.y,
        theta: normalizeAngle(a.theta + b.theta),
    };
};

export const invert = (a: Pose2D): Pose2D => {
    const c = Math.cos(a.theta);
    const s = Math.sin(a.theta);
    return {
        x: -(c * a.x + s * a.y),
        y: -(-s * a.x + c * a.y),
        theta: normalizeAngle(-a.theta),
    };
};

export const transformPoint = (a: Pose2D, p: { x: number; y: number }) => {
    const c = Math.cos(a.theta);
    const s = Math.sin(a.theta);
    return { x: a.x + c * p.x - s * p.y, y: a.y + s * p.x + c * p.y };
};

export const poseFromRos = (position: Vector3, orientation: Quaternion): Pose2D => ({
    x: position.x,
    y: position.y,
    theta: yawFromQuaternion(orientation),
});
