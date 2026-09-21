import { useEffect, useState } from "react";

/** True while the tab is visible and the window has focus - the deadman's "hand on the UI". */
export const usePageActive = () => {
    const [visible, setVisible] = useState(() => document.visibilityState === "visible");
    const [focused, setFocused] = useState(() => document.hasFocus());

    useEffect(() => {
        const onVisibility = () => setVisible(document.visibilityState === "visible");
        const onFocus = () => setFocused(true);
        const onBlur = () => setFocused(false);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("focus", onFocus);
        window.addEventListener("blur", onBlur);
        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("focus", onFocus);
            window.removeEventListener("blur", onBlur);
        };
    }, []);

    return { visible, focused };
};
