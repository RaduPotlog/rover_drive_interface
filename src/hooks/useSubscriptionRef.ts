import { useEffect, useRef } from "react";

import { Topic } from "../ros";
import { useRos } from "../ros/RosProvider";

/**
 * Subscribe without re-rendering: every message goes to `onMessage` (typically writing a
 * ref and marking a canvas dirty). For high-rate topics such as /tf and scan.
 */
export const useSubscriptionRef = <T,>(
    name: string | null,
    messageType: string,
    onMessage: (message: T) => void,
) => {
    const { ros, connected, session } = useRos();
    const handler = useRef(onMessage);
    handler.current = onMessage;

    useEffect(() => {
        if (!ros || !connected || !name) return;
        const topic = new Topic<T>({ ros, name, messageType });
        const callback = (message: T) => handler.current(message);
        topic.subscribe(callback);
        return () => topic.unsubscribe(callback);
    }, [ros, connected, session, name, messageType]);
};
