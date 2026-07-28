type Props = {
  size?: number;
};

export function ChartIcon({ size = 20 }: Props) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5h16" />
      <path d="M6.5 17v-4.5" />
      <path d="M11.5 17V7" />
      <path d="M16.5 17V4" />
    </svg>
  );
}
