import { useMemo } from "react";
import { encodeQr, qrToPath, type Ecc } from "../lib/qr";

/**
 * Scan-to-pay QR for spec Module 4. Rendered as a single SVG path so it stays
 * crisp at any size and costs one DOM node regardless of module count.
 */
export function QrCode({
  value,
  size = 180,
  ecc = "M",
  className,
}: {
  value: string;
  size?: number;
  /** Error correction. "M" tolerates ~15% damage, which is plenty on a screen. */
  ecc?: Ecc;
  className?: string;
}) {
  const qr = useMemo(() => {
    try {
      const matrix = encodeQr(value, ecc);
      return { path: qrToPath(matrix), modules: matrix.size };
    } catch {
      // Only reachable past version 40's capacity; a pay URI never gets there.
      return null;
    }
  }, [value, ecc]);

  if (!qr) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          display: "grid",
          placeItems: "center",
          fontSize: "0.75rem",
          color: "var(--ink-faint)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        Too much data to encode
      </div>
    );
  }

  // A 4-module quiet zone is required by the spec for reliable scanning.
  const quiet = 4;
  const extent = qr.modules + quiet * 2;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      role="img"
      aria-label="Scan to pay"
      shapeRendering="crispEdges"
      style={{ borderRadius: "var(--radius-sm)", display: "block" }}
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <g transform={`translate(${quiet} ${quiet})`}>
        <path d={qr.path} fill="#0b0b09" />
      </g>
    </svg>
  );
}
