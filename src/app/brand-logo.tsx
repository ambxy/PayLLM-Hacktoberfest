// Human, agent and bank as the triangle's nodes, with the account at the centre.
const tones = {
  light: {
    line: "#8b5cf6",
    node: "#7c3aed",
    accent: "#d946ef",
    core: "#6d28d9",
    letter: "#fff",
  },
  dark: {
    line: "#c4b5fd",
    node: "#fff",
    accent: "#f0abfc",
    core: "#fff",
    letter: "#5b21b6",
  },
};
export function BrandLogo({
  size = 36,
  tone = "light",
}: {
  size?: number;
  tone?: keyof typeof tones;
}) {
  const c = tones[tone];
  return (
    <svg
      className="brand-logo"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <g fill="none" stroke={c.line} strokeWidth="2">
        <circle cx="50" cy="52" r="42" opacity="0.4" />
        <circle cx="50" cy="52" r="30" opacity="0.4" />
        <path d="M50 10 L86.4 73 L13.6 73 Z" />
      </g>
      <circle cx="50" cy="10" r="7" fill={c.accent} />
      <circle cx="13.6" cy="73" r="7" fill={c.node} />
      <circle cx="86.4" cy="73" r="7" fill={c.node} />
      <circle cx="50" cy="52" r="17" fill={c.core} />
      <path
        d="M43 61 L50 44 L57 61 M45.5 55.5 H54.5"
        fill="none"
        stroke={c.letter}
        strokeWidth="3.4"
        strokeLinecap="square"
      />
    </svg>
  );
}
