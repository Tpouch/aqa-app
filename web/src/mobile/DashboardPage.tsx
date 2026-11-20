import { useRef, useState } from "react";
import type { DeviceSummary, Metric } from "../../../server/src/types";
import { Gauge } from "./Gauge";
import { moveItem, readOrder, saveOrder } from "./order";
import { useReorder } from "./useReorder";

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 8; // px a finger may drift before a press stops being "long"

// Dashboard: one gauge per metric on two columns, in the order chosen on this phone.
export function DashboardPage({ device, onOpen }: { device: DeviceSummary; onOpen: (m: Metric) => void }) {
  const [order, setOrder] = useState(readOrder);
  const [editing, setEditing] = useState(false);
  const change = (o: Metric[]) => { setOrder(o); saveOrder(o); };
  const { lifted, bind, gridRef } = useReorder(order, change, editing);
  const stale = !device.online || !!device.latest?.stale;

  // Long press on a gauge enters organise mode; the click that follows must not open the chart.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const longPress = {
    onPointerDown: (e: React.PointerEvent) => {
      swallowClick.current = false;
      cancelPress();
      press.current = {
        x: e.clientX, y: e.clientY,
        timer: window.setTimeout(() => {
          press.current = null;
          swallowClick.current = true;
          navigator.vibrate?.(10);
          setEditing(true);
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return (
    <div className="mb-dash">
      <div className="mb-dash-tools">
        <button type="button" className={`btn${editing ? " primary" : ""}`} aria-pressed={editing}
                onClick={() => setEditing(!editing)}>
          {editing ? "terminé" : "organiser"}
        </button>
      </div>
      {editing && <p className="mb-hint muted small">Glisse une jauge par sa poignée ⋮⋮ (ou utilise ↑ ↓) pour changer l'ordre. L'ordre est gardé sur ce téléphone.</p>}
      <div ref={gridRef} className={`mb-gauges${editing ? " mb-editing" : ""}`}>
        {order.map((m, i) => (
          <Gauge key={m} metric={m} device={device} stale={stale} editing={editing} lifted={lifted === m}
                 first={i === 0} last={i === order.length - 1}
                 onOpen={() => { if (swallowClick.current) { swallowClick.current = false; return; } onOpen(m); }}
                 onMove={(d) => change(moveItem(order, i, i + d))}
                 pointer={editing ? bind(m) : longPress} />
        ))}
      </div>
    </div>
  );
}
