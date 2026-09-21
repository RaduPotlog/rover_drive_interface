// A minimal 2D TF buffer: keeps the latest transform of every parent->child edge from
// /tf and /tf_static and resolves chains through the common ancestor. No time travel -
// the UI only ever wants "where is the robot now".
import { compose, invert, IDENTITY, type Pose2D, poseFromRos, type Quaternion, type Vector3 } from "./geometry";
import { normalizeFrame } from "./namespace";

export interface TransformStamped {
    header: { frame_id: string; stamp?: { sec: number; nanosec: number } };
    child_frame_id: string;
    transform: { translation: Vector3; rotation: Quaternion };
}

interface Edge {
    parent: string;
    transform: Pose2D; // child pose in parent
    receivedAt: number;
}

export class TfBuffer {
    #edges = new Map<string, Edge>(); // keyed by child frame

    add(transforms: TransformStamped[], now = Date.now()) {
        for (const t of transforms) {
            const child = normalizeFrame(t.child_frame_id);
            const parent = normalizeFrame(t.header.frame_id);
            if (!child || !parent || child === parent) continue;
            this.#edges.set(child, {
                parent,
                transform: poseFromRos(t.transform.translation, t.transform.rotation),
                receivedAt: now,
            });
        }
    }

    clear() {
        this.#edges.clear();
    }

    /** Frames from `frame` up to its root, with the pose of `frame` in each of them. */
    #ancestry(frame: string): Map<string, Pose2D> {
        const chain = new Map<string, Pose2D>();
        let current = frame;
        let pose = IDENTITY;
        chain.set(current, pose);
        for (let guard = 0; guard < 64; guard++) {
            const edge = this.#edges.get(current);
            if (!edge) break;
            pose = compose(edge.transform, pose);
            current = edge.parent;
            if (chain.has(current)) break; // cycle
            chain.set(current, pose);
        }
        return chain;
    }

    /** Pose of `source` expressed in `target`, or null when they are not connected. */
    lookup(target: string, source: string): Pose2D | null {
        const t = normalizeFrame(target);
        const s = normalizeFrame(source);
        const sourceUp = this.#ancestry(s);
        const targetUp = this.#ancestry(t);
        for (const [frame, sourceInFrame] of sourceUp) {
            const targetInFrame = targetUp.get(frame);
            if (targetInFrame) {
                return compose(invert(targetInFrame), sourceInFrame);
            }
        }
        return null;
    }

    /** Milliseconds since the newest edge on the chain from `source` upwards was received. */
    age(source: string, now = Date.now()): number | null {
        let current = normalizeFrame(source);
        let oldest: number | null = null;
        for (let guard = 0; guard < 64; guard++) {
            const edge = this.#edges.get(current);
            if (!edge) break;
            oldest = oldest === null ? edge.receivedAt : Math.min(oldest, edge.receivedAt);
            current = edge.parent;
        }
        return oldest === null ? null : now - oldest;
    }
}
