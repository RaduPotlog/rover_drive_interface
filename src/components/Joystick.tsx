import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { StickInput } from "../lib/teleop";

// A round on-screen thumbstick. Pointer events cover mouse, touch and pen; the stick
// springs back to centre (and reports 0,0) on release, cancel or lost capture.
export const Joystick = ({ disabled, onChange, size = 200 }: {
    disabled: boolean;
    onChange: (input: StickInput) => void;
    size?: number;
}) => {
    const baseRef = useRef<HTMLDivElement>(null);
    const [knob, setKnob] = useState({ x: 0, y: 0 });
    const active = useRef<number | null>(null);
    const radius = size / 2;
    const knobRadius = size * 0.2;

    const release = useCallback(() => {
        active.current = null;
        setKnob({ x: 0, y: 0 });
        onChange({ x: 0, y: 0 });
    }, [onChange]);

    useEffect(() => {
        if (disabled) release();
    }, [disabled, release]);

    const update = (clientX: number, clientY: number) => {
        const rect = baseRef.current?.getBoundingClientRect();
        if (!rect) return;
        let dx = clientX - (rect.left + radius);
        let dy = clientY - (rect.top + radius);
        const travel = radius - knobRadius;
        const dist = Math.hypot(dx, dy);
        if (dist > travel) {
            dx = (dx / dist) * travel;
            dy = (dy / dist) * travel;
        }
        setKnob({ x: dx, y: dy });
        onChange({ x: dx / travel, y: -dy / travel });
    };

    return (
        <div
            ref={baseRef}
            className={`joystick${disabled ? " joystick-disabled" : ""}`}
            style={{ width: size, height: size }}
            onPointerDown={(e) => {
                if (disabled) return;
                active.current = e.pointerId;
                e.currentTarget.setPointerCapture(e.pointerId);
                update(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
                if (active.current === e.pointerId) update(e.clientX, e.clientY);
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onLostPointerCapture={release}
            role="application"
            aria-label="Drive joystick"
        >
            <span className="joystick-tick" style={{ top: 8 }}><ChevronUp size={18} /></span>
            <span className="joystick-tick" style={{ bottom: 8 }}><ChevronDown size={18} /></span>
            <span className="joystick-tick" style={{ left: 8 }}><ChevronLeft size={18} /></span>
            <span className="joystick-tick" style={{ right: 8 }}><ChevronRight size={18} /></span>
            <div
                className="joystick-knob"
                style={{
                    width: knobRadius * 2,
                    height: knobRadius * 2,
                    transform: `translate(${knob.x}px, ${knob.y}px)`,
                }}
            />
        </div>
    );
};
