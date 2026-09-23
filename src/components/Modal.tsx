import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A centred dialog over a dimmed page.
 *
 * It portals to `document.body` because the top bar is a 60 px flex row whose status strip is
 * `overflow-x: auto` - anything rendered in place would be clipped. Hand-rolled rather than
 * `<dialog>`: StrictMode double-invokes effects, and a second `showModal()` on an open dialog
 * throws, while `::backdrop` fights the scrolling flex body.
 */
export const Modal = ({ onClose, title, icon, actions, wide, children }: {
    onClose: () => void;
    title: string;
    icon?: ReactNode;
    /** Buttons for the header, left of the close button. */
    actions?: ReactNode;
    wide?: boolean;
    children: ReactNode;
}) => {
    const titleId = useId();
    const panel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        panel.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== "Tab" || !panel.current) return;
            // Keep Tab inside the dialog; the page behind is not inert.
            const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
                .filter((el) => el.offsetParent !== null);
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
                event.preventDefault();
                last.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    return createPortal(
        <div
            className="modal-backdrop"
            // mousedown, not click: a text drag that starts inside and ends on the backdrop
            // must not count as "clicked outside".
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
        >
            <div
                className={`modal ${wide ? "modal-wide" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                ref={panel}
                tabIndex={-1}
            >
                <div className="modal-head">
                    <h2 className="modal-title" id={titleId}>{icon}{title}</h2>
                    <div className="modal-actions">
                        {actions}
                        <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
                            <X size={16} />
                        </button>
                    </div>
                </div>
                <div className="modal-body">{children}</div>
            </div>
        </div>,
        document.body,
    );
};
