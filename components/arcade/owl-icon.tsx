import type { SVGProps } from "react";

type BlueOwlIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export function BlueOwlIcon({ size = 24, ...props }: BlueOwlIconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="파란 보카부엉"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M7 17 5 5l12 7Q24 8 31 12L43 5l-2 15v10c0 9-7 14-17 14S7 39 7 30V17Z" fill="#3299f5" stroke="#124b9b" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M9 22c2-8 9-11 15-11s13 3 15 11c2 10-4 18-15 18S7 32 9 22Z" fill="#fff" />
      <ellipse cx="18" cy="23" rx="3.2" ry="4.3" fill="#123f86" />
      <ellipse cx="30" cy="23" rx="3.2" ry="4.3" fill="#123f86" />
      <circle cx="17" cy="21.5" r="1.1" fill="#fff" />
      <circle cx="29" cy="21.5" r="1.1" fill="#fff" />
      <path d="m21 28 3-2 3 2-3 5-3-5Z" fill="#f8b51b" stroke="#a85c08" strokeWidth="1" strokeLinejoin="round" />
      <path d="M13 37c2 2 4 3 7 3m15-3c-2 2-4 3-7 3" fill="none" stroke="#3999f2" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
