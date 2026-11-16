import type { CSSProperties } from "react";

type MonsterAvatarProps = {
  color: string;
  className?: string;
  style?: CSSProperties;
};

export function MonsterAvatar({ color, className, style }: MonsterAvatarProps) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="영단어 몬스터" className={className} style={style}>
      <path
        d="M15 80V43C15 8 85 8 85 43V80Q70 66 60 80Q50 94 40 80Q25 66 15 80Z"
        fill={color}
        stroke="rgba(15,23,42,0.2)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <ellipse cx="36" cy="43" rx="9" ry="12" fill="#fff" />
      <ellipse cx="64" cy="43" rx="9" ry="12" fill="#fff" />
      <circle cx="38" cy="45" r="4" fill="#172033" />
      <circle cx="66" cy="45" r="4" fill="#172033" />
      <path d="M44 62Q50 69 56 62" fill="none" stroke="#172033" strokeWidth="4" strokeLinecap="round" />
      <path d="M20 25Q50 7 80 25" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
