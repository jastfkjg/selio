export function Mark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="10" fill="currentColor"/><path d="M22 9.5H14.5C11.5 9.5 10 11 10 13s1.5 3 4.5 3h3c3 0 4.5 1 4.5 3s-1.5 3.5-4.5 3.5H10" stroke="var(--logo-ink, #fff)" strokeWidth="2.5" strokeLinecap="round"/><path d="M22 7v5M10 20v5" stroke="var(--logo-ink, #fff)" strokeWidth="2" strokeLinecap="round"/></svg>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><Mark size={compact ? 25 : 34}/><span>selio<span className="brand-dot">.</span></span></span>;
}
