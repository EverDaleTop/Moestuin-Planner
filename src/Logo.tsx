interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 34, className }: LogoMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="15" fill="var(--logo-tile)" />
      <circle cx="20" cy="20" r="10" fill="var(--harvest)" />
      <path
        d="M34 44A10 10 0 0 1 44 34H54V44A10 10 0 0 1 44 54H34Z"
        fill="var(--logo-fg)"
      />
    </svg>
  );
}
