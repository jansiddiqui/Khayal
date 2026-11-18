import qrcode from "qrcode-generator";
import { useMemo } from "react";

/**
 * A QR code drawn as one SVG path (pair-entry). `qrcode-generator` (MIT, no dependencies) only
 * works out the dark modules; nothing is injected as HTML. Dark ink on white with the standard
 * 4-module quiet zone, so phone cameras read it on any theme.
 */
export function QrCode({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
      }
    }
    return { path: d, count: n + 8 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-md border border-line"
    >
      <rect width={count} height={count} fill="#ffffff" />
      <path d={path} fill="#102325" />
    </svg>
  );
}
