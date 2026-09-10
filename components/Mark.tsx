// THE GRAPHIC. Replace this SVG, or drop a file in public/ and use next/image.
export function Mark() {
  return (
    <svg
      viewBox="0 0 640 200"
      role="img"
      aria-label="Fireground"
      className="mb-8 w-full"
    >
      <defs>
        <linearGradient id="ember" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#ember)" strokeWidth="3" strokeLinecap="round">
        <path d="M40 170 L110 60 L180 170" />
        <path d="M200 170 L260 90 L320 170" />
        <path d="M340 170 L420 40 L500 170" />
        <path d="M520 170 L570 110 L600 170" />
      </g>
      <line x1="20" y1="176" x2="620" y2="176" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
    </svg>
  );
}
