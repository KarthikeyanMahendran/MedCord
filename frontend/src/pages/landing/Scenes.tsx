/** Original SVG scenes for the landing page. */

function Hut({ x, y, w = 90, roof = '#c8553d', wall = '#f4e3c8' }: { x: number; y: number; w?: number; roof?: string; wall?: string }) {
  const h = w * 0.55
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width={w} height={h} fill={wall} />
      <path d={`M-8 2 L${w / 2} ${-w * 0.42} L${w + 8} 2 Z`} fill={roof} />
      <rect x={w * 0.4} y={h * 0.38} width={w * 0.2} height={h * 0.62} rx="3" fill="#8a5a3c" />
      <rect x={w * 0.12} y={h * 0.25} width={w * 0.16} height={h * 0.26} rx="2" fill="#9ed0ff" />
    </g>
  )
}

function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0c4-30 2-60 8-90" stroke="#6b4a2f" strokeWidth="6" fill="none" strokeLinecap="round" />
      {[-70, -35, 0, 35, 70].map((a) => (
        <path key={a} d="M8 -90c20-6 36 4 44 22c-18-8-30-8-44-22z" fill="#2f9e6a" transform={`rotate(${a} 8 -90)`} />
      ))}
    </g>
  )
}

/** Wide scene: village, health post, signal to a doctor on a screen. */
export function VillageScene({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 520" role="img" aria-label="A village health post connected to a doctor by a live signal" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a2a63" /><stop offset=".55" stopColor="#2f7bff" /><stop offset="1" stopColor="#bfe0ff" /></linearGradient>
        <linearGradient id="hillA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2fa57a" /><stop offset="1" stopColor="#1b7a5a" /></linearGradient>
        <linearGradient id="hillB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#52c08e" /><stop offset="1" stopColor="#2a9468" /></linearGradient>
        <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff6c9" /><stop offset="1" stopColor="#fff6c9" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1200" height="520" fill="url(#sky)" />
      <circle cx="930" cy="150" r="130" fill="url(#sun)" /><circle cx="930" cy="150" r="46" fill="#fff3b8" />
      <g fill="#fff" opacity=".85">
        <ellipse cx="1080" cy="70" rx="70" ry="20" /><ellipse cx="1130" cy="56" rx="46" ry="18" /><ellipse cx="640" cy="70" rx="80" ry="20" /><ellipse cx="700" cy="56" rx="44" ry="16" />
      </g>
      <path d="M0 330c180-70 320-60 470-20s300 30 460-30 190-10 270 10v250H0z" fill="url(#hillA)" />
      <path d="M0 400c200-60 380-40 560 0s420 20 640-30v150H0z" fill="url(#hillB)" />

      {/* Health post */}
      <g transform="translate(330 300)">
        <rect x="0" y="40" width="230" height="110" fill="#ffffff" />
        <rect x="-10" y="28" width="250" height="16" rx="3" fill="#1456d6" />
        <rect x="92" y="78" width="46" height="72" rx="4" fill="#9ed0ff" /><path d="M115 78v72" stroke="#fff" strokeWidth="3" />
        <rect x="22" y="70" width="44" height="40" rx="4" fill="#cfe5ff" /><rect x="164" y="70" width="44" height="40" rx="4" fill="#cfe5ff" />
        <circle cx="115" cy="8" r="26" fill="#fff" /><path d="M115 -6v28M101 8h28" stroke="#e23a4e" strokeWidth="9" strokeLinecap="round" />
      </g>
      <Hut x={120} y={380} w={96} />
      <Hut x={650} y={372} w={104} roof="#d9822b" />
      <Hut x={800} y={392} w={80} roof="#b8452f" wall="#f1dcb8" />
      <Palm x={70} y={430} s={1.05} /><Palm x={1020} y={440} s={1.15} /><Palm x={600} y={420} s={.8} />
      <path d="M470 520c30-60 80-90 120-96" stroke="#e7d3a6" strokeWidth="26" fill="none" strokeLinecap="round" opacity=".9" />

      {/* ASHA worker with phone */}
      <g transform="translate(560 392)">
        <ellipse cx="22" cy="106" rx="30" ry="6" fill="#0a3a2a" opacity=".25" />
        <path d="M4 100V56c0-16 10-24 18-24s18 8 18 24v44z" fill="#e4572e" />
        <path d="M22 34c10 8 20 20 22 40l-14 6z" fill="#f3b33d" />
        <rect x="14" y="58" width="16" height="44" rx="4" fill="#2c3e75" opacity="0" />
        <circle cx="22" cy="18" r="13" fill="#b9794f" /><path d="M9 16c0-12 8-16 13-16s13 4 13 16c-4-6-8-8-13-8s-9 2-13 8z" fill="#1a1210" />
        <circle cx="22" cy="10" r="1.6" fill="#c2185b" />
        <rect x="36" y="46" width="12" height="20" rx="3" fill="#122a5c" /><rect x="38" y="49" width="8" height="12" rx="1.5" fill="#7fd1ff" />
      </g>

      {/* Signal rising to the doctor screen */}
      <g fill="none" stroke="#fff" strokeLinecap="round">
        <path d="M606 420C640 330 720 280 800 236" strokeWidth="3" strokeDasharray="2 10" opacity=".95"><animate attributeName="stroke-dashoffset" from="0" to="-48" dur="2s" repeatCount="indefinite" /></path>
        <circle cx="600" cy="414" r="14" strokeWidth="2" opacity=".7"><animate attributeName="r" values="10;32" dur="2.2s" repeatCount="indefinite" /><animate attributeName="opacity" values=".8;0" dur="2.2s" repeatCount="indefinite" /></circle>
      </g>

      {/* Doctor on a screen */}
      <g transform="translate(790 120)">
        <rect x="0" y="0" width="210" height="130" rx="14" fill="#0a1f4a" stroke="#fff" strokeOpacity=".5" strokeWidth="3" />
        <rect x="8" y="8" width="194" height="114" rx="9" fill="#dbe8ff" />
        <path d="M30 122c4-30 28-40 75-40s71 10 75 40z" fill="#fff" />
        <path d="M92 86l13 18 13-18" fill="none" stroke="#c9d6ee" strokeWidth="3" />
        <path d="M86 90c-8 12-6 24 2 26M124 90c8 12 6 24-2 26" fill="none" stroke="#2b3a67" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="95" y="68" width="20" height="18" rx="8" fill="#c68a63" /><ellipse cx="105" cy="52" rx="20" ry="23" fill="#c68a63" />
        <circle cx="105" cy="26" r="9" fill="#1c1412" /><path d="M85 52c-2-22 10-30 20-30s22 8 20 30c-4-12-10-17-20-17s-16 5-20 17z" fill="#1c1412" />
        <circle cx="97" cy="54" r="2" fill="#2a1d18" /><circle cx="113" cy="54" r="2" fill="#2a1d18" /><path d="M98 63c4 4 10 4 14 0" stroke="#7a3f2a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <circle cx="190" cy="20" r="6" fill="#1fc77f"><animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite" /></circle>
      </g>
      <g fill="#fff"><circle cx="200" cy="230" r="2" /><circle cx="420" cy="170" r="1.6" /><circle cx="1090" cy="260" r="2" /><circle cx="90" cy="90" r="1.6" /></g>
    </svg>
  )
}
