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
      <path d="M6.5 17V10" />
      <path d="M11.5 17V6" />
      <path d="M16.5 17v-4" />
      <path d="M6.5 8.5 11.5 4l5 5" />
    </svg>
  );
}
