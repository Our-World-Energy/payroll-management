type Point = { day: string; value: number; previous: number };

const DATA: Point[] = [
  { day: "Mon", value: 1080, previous: 940 },
  { day: "Tue", value: 1240, previous: 1100 },
  { day: "Wed", value: 1372, previous: 1180 },
  { day: "Thu", value: 1180, previous: 1210 },
  { day: "Fri", value: 1290, previous: 1240 },
  { day: "Sat", value: 540, previous: 460 },
  { day: "Sun", value: 410, previous: 380 },
];

const W = 720;
const H = 240;
const PAD_X = 36;
const PAD_TOP = 18;
const PAD_BOT = 32;
const MAX = 1500;

function smoothPath(points: [number, number][]) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

export function AttendanceChart() {
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOT;
  const stepX = innerW / (DATA.length - 1);

  const toXY = (v: number, i: number): [number, number] => [
    PAD_X + i * stepX,
    PAD_TOP + (innerH - (v / MAX) * innerH),
  ];

  const cur = DATA.map((p, i) => toXY(p.value, i));
  const prev = DATA.map((p, i) => toXY(p.previous, i));

  const curPath = smoothPath(cur);
  const prevPath = smoothPath(prev);
  const areaPath = `${curPath} L${cur[cur.length - 1][0]},${H - PAD_BOT} L${cur[0][0]},${H - PAD_BOT} Z`;

  const highlight = DATA.findIndex((d) => d.day === "Wed");
  const [hx, hy] = cur[highlight];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[240px]"
      role="img"
      aria-label="Weekly attendance trends"
    >
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10b981" stopOpacity="0.22" />
          <stop offset="1" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* y grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
        const y = PAD_TOP + innerH * (1 - g);
        const v = Math.round(MAX * g);
        return (
          <g key={i}>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y}
              y2={y}
              stroke="rgba(54,52,45,0.08)"
              strokeWidth="1"
              strokeDasharray={g === 0 ? "" : "2 4"}
            />
            <text
              x={PAD_X - 10}
              y={y + 3}
              textAnchor="end"
              fontSize="10"
              fill="#918c7f"
              fontFamily="inherit"
            >
              {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
            </text>
          </g>
        );
      })}

      {/* previous week — faint */}
      <path
        d={prevPath}
        fill="none"
        stroke="#cbd5e1"
        strokeWidth="1.5"
        strokeDasharray="3 4"
        strokeLinecap="round"
      />

      {/* this week */}
      <path d={areaPath} fill="url(#area-grad)" />
      <path
        d={curPath}
        fill="none"
        stroke="#0f766e"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* point markers */}
      {cur.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === highlight ? 5 : 3}
          fill={i === highlight ? "#ffffff" : "#0f766e"}
          stroke="#0f766e"
          strokeWidth={i === highlight ? 2.4 : 1}
        />
      ))}

      {/* highlight tooltip */}
      <g>
        <line
          x1={hx}
          x2={hx}
          y1={hy + 8}
          y2={H - PAD_BOT}
          stroke="#0f766e"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.55"
        />
        <g transform={`translate(${hx - 38}, ${hy - 42})`}>
          <rect width="76" height="30" rx="8" fill="#121210" />
          <text
            x="38"
            y="13"
            textAnchor="middle"
            fontSize="9"
            fill="#918c7f"
            fontFamily="inherit"
            letterSpacing="0.06em"
          >
            WED · 24 APR
          </text>
          <text
            x="38"
            y="25"
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#ffffff"
            fontFamily="inherit"
          >
            1,372 check-ins
          </text>
        </g>
      </g>

      {/* x labels */}
      {DATA.map((d, i) => {
        const [x] = cur[i];
        return (
          <text
            key={d.day}
            x={x}
            y={H - 10}
            textAnchor="middle"
            fontSize="11"
            fill={i === highlight ? "#0f766e" : "#6c6759"}
            fontWeight={i === highlight ? 600 : 500}
            fontFamily="inherit"
          >
            {d.day}
          </text>
        );
      })}
    </svg>
  );
}
