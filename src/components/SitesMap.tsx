type Site = {
  cx: number;
  cy: number;
  size: number;
  label: string;
  active: number;
};

const SITES: Site[] = [
  { cx: 120, cy: 130, size: 14, label: "Solar Array A", active: 142 },
  { cx: 220, cy: 90, size: 10, label: "Wind Farm East", active: 89 },
  { cx: 310, cy: 170, size: 8, label: "Hydro Beta", active: 54 },
  { cx: 380, cy: 110, size: 12, label: "Solar Array C", active: 96 },
  { cx: 460, cy: 200, size: 9, label: "Geo South", active: 38 },
  { cx: 540, cy: 140, size: 11, label: "Storage Hub", active: 72 },
];

export function SitesMap() {
  return (
    <svg
      viewBox="0 0 640 280"
      className="w-full h-full"
      role="img"
      aria-label="Regional site activity"
    >
      <defs>
        <linearGradient id="map-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#022c22" />
          <stop offset="1" stopColor="#064e3b" />
        </linearGradient>
        <radialGradient id="pulse" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#5eead4" stopOpacity="0.6" />
          <stop offset="1" stopColor="#5eead4" stopOpacity="0" />
        </radialGradient>
        <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="rgba(94, 234, 212, 0.10)"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width="640" height="280" fill="url(#map-bg)" />
      <rect width="640" height="280" fill="url(#map-grid)" />

      {/* Stylized continent shapes */}
      <g fill="rgba(94, 234, 212, 0.08)" stroke="rgba(94, 234, 212, 0.20)" strokeWidth="1">
        <path d="M40 200 Q90 150 140 170 T260 150 Q320 130 360 160 Q400 200 380 240 Q300 270 220 250 Q120 240 40 200 Z" />
        <path d="M380 90 Q440 60 500 80 Q560 100 600 130 Q610 180 560 200 Q500 210 460 180 Q420 140 380 90 Z" />
      </g>

      {/* Connection lines */}
      <g stroke="rgba(94, 234, 212, 0.25)" strokeWidth="1" fill="none" strokeDasharray="2 4">
        <line x1="120" y1="130" x2="220" y2="90" />
        <line x1="220" y1="90" x2="380" y2="110" />
        <line x1="380" y1="110" x2="540" y2="140" />
        <line x1="310" y1="170" x2="460" y2="200" />
        <line x1="120" y1="130" x2="310" y2="170" />
      </g>

      {/* Sites */}
      {SITES.map((s, i) => (
        <g key={i}>
          <circle cx={s.cx} cy={s.cy} r={s.size * 2.4} fill="url(#pulse)">
            <animate
              attributeName="r"
              values={`${s.size * 1.6};${s.size * 2.8};${s.size * 1.6}`}
              dur="2.4s"
              begin={`${i * 0.18}s`}
              repeatCount="indefinite"
            />
          </circle>
          <circle cx={s.cx} cy={s.cy} r={s.size / 2 + 2} fill="#022c22" stroke="#5eead4" strokeWidth="1.5" />
          <circle cx={s.cx} cy={s.cy} r={s.size / 4} fill="#5eead4" />
        </g>
      ))}
    </svg>
  );
}
