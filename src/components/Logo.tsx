type LogoProps = {
  className?: string;
  variant?: "default" | "mono";
};

export function Logo({ className = "h-8 w-8", variant = "default" }: LogoProps) {
  const fillTop = variant === "mono" ? "currentColor" : "url(#owe-grad-top)";
  const fillBot = variant === "mono" ? "currentColor" : "url(#owe-grad-bot)";

  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="owe-grad-top" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
        <linearGradient id="owe-grad-bot" x1="0" y1="40" x2="40" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#064e3b" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill={fillBot} />
      <path
        d="M20 8c-5.5 4-8 7.8-8 12.2 0 4.6 3.6 8.3 8 8.3s8-3.7 8-8.3c0-4.4-2.5-8.2-8-12.2Z"
        fill={fillTop}
        opacity="0.95"
      />
      <circle cx="20" cy="22" r="2.6" fill="#ffffff" opacity="0.95" />
    </svg>
  );
}
