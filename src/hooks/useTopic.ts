import { useEffect, useRef, useState } from "react";

import { Topic } from "../ros";
import { useRos } from "../ros/RosProvider";

export interface Latest<T> {
    message: T | null;
    receivedAt: number | null;
}

/**
 * Subscribe to a topic and keep the latest message. `throttleMs` bounds React re-renders
 * for fast topics (scan at 10 Hz, costmaps); the newest message always wins.
 */
export const useTopic = <T,>(name: string | null, messageType: string, throttleMs = 0): Latest<T> => {
    const { ros, connected, session } = useRos();
    const [latest, setLatest] = useState<Latest<T>>({ message: null, receivedAt: null });
    const pending = useRef<{ message: T; at: number } | null>(null);

    useEffect(() => {
        setLatest({ message: null, receivedAt: null });
        if (!ros || !connected || !name) return;

        const topic = new Topic<T>({ ros, name, messageType });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const flush = () => {
            timer = undefined;
            const p = pending.current;
            if (p) setLatest({ message: p.message, receivedAt: p.at });
        };
        const callback = (message: T) => {
            pending.current = { message, at: Date.now() };
            if (throttleMs <= 0) flush();
            else if (!timer) timer = setTimeout(flush, throttleMs);
        };
        topic.subscribe(callback);
        return () => {
            clearTimeout(timer);
            topic.unsubscribe(callback);
            pending.current = null;
        };
    }, [ros, connected, session, name, messageType, throttleMs]);

    return latest;
};

/** Re-render periodically so "stale" indicators update without new messages. */
export const useNow = (periodMs = 1000) => {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), periodMs);
        return () => clearInterval(id);
    }, [periodMs]);
    return now;
};
