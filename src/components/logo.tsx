export function GateMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <rect x="3.5" y="5.5" width="25" height="21" rx="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13 5.5v6.5a3 3 0 0 0 6 0V5.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="18.5" r="1.6" fill="currentColor" />
    </svg>
  );
}
