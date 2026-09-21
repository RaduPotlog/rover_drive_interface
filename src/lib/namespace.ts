// Namespace handling. The rover runs every node under $ROVER_NAMESPACE (e.g. "rover"),
// so both topic names and TF frame ids carry it as a prefix.

// Same rules as rover_cockpit_ros2_diagnostics' sanitizeNamespace: keep [A-Za-z0-9_/],
// no leading digits per segment, single leading slash, no trailing slash.
export const sanitizeNamespace = (namespace: string): string => {
    const cleaned = namespace
            .replace(/[^a-zA-Z0-9_/]/g, "")
            .replace(/_+/g, "_")
            .replace(/\/+/g, "/")
            .replace(/^\d+/, "")
            .replace(/\/\d+/g, "/")
            .replace(/\/+/g, "/")
            .replace(/^\/|\/$/g, "");
    return cleaned ? `/${cleaned}` : "";
};

/** Absolute topic/service name under the namespace: ("/rover", "scan") -> "/rover/scan". */
export const nsName = (namespace: string, name: string): string => {
    const relative = name.replace(/^\/+/, "");
    return `${namespace}/${relative}`;
};

/** TF frame id under the namespace: ("/rover", "base_link") -> "rover/base_link". */
export const nsFrame = (namespace: string, frame: string): string => {
    const prefix = namespace.replace(/^\/+/, "");
    return prefix ? `${prefix}/${frame}` : frame;
};

/** Frame ids compare without a leading slash (tf2 strips it too). */
export const normalizeFrame = (frame: string): string => frame.replace(/^\/+/, "");
