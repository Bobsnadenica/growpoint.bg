export default function HeroAnimation() {
  return (
    <svg
      className="home-hero__illustration"
      viewBox="0 0 560 480"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="growpoint-hero-surface" x1="72" y1="48" x2="468" y2="432">
          <stop stopColor="#E6F0EC" />
          <stop offset="1" stopColor="#CADCD5" />
        </linearGradient>
        <linearGradient id="growpoint-hero-card" x1="174" y1="116" x2="398" y2="382">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#F4F8F6" />
        </linearGradient>
        <filter id="growpoint-hero-shadow" x="74" y="50" width="412" height="398" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#20463A" floodOpacity="0.16" />
        </filter>
      </defs>

      <circle cx="82" cy="111" r="42" fill="#D6E9E0" />
      <circle cx="479" cy="372" r="54" fill="#F4DFB3" />
      <path d="M74 370C123 319 162 367 202 324C243 279 291 335 333 291C373 250 421 277 487 211" stroke="#88B7A4" strokeWidth="8" strokeLinecap="round" />

      <g filter="url(#growpoint-hero-shadow)">
        <rect x="126" y="80" width="308" height="330" rx="30" fill="url(#growpoint-hero-surface)" />
        <rect x="151" y="106" width="258" height="280" rx="22" fill="url(#growpoint-hero-card)" />
      </g>

      <rect x="177" y="137" width="70" height="70" rx="22" fill="#3E7965" />
      <path d="M197 178L209 190L229 158" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="268" y="143" width="101" height="14" rx="7" fill="#25493D" />
      <rect x="268" y="172" width="75" height="10" rx="5" fill="#91ABA1" />

      <rect x="177" y="236" width="206" height="18" rx="9" fill="#315F50" />
      <rect x="177" y="269" width="162" height="12" rx="6" fill="#A0B8AF" />
      <rect x="177" y="294" width="186" height="12" rx="6" fill="#A0B8AF" />
      <rect x="177" y="330" width="105" height="30" rx="15" fill="#E7B95C" />
      <path d="M297 345H368" stroke="#8CA99E" strokeWidth="12" strokeLinecap="round" />

      <circle cx="437" cy="88" r="25" fill="#E9B85C" />
      <path d="M437 76V100M425 88H449" stroke="#25493D" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
