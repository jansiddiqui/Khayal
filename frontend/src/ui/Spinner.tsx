/** A small busy mark that sits inside a button or beside a word. Never shown alone: the
 * surrounding control or text says what is happening. Under reduced motion it stays still. */
export function Spinner({ className = "size-[1.1em]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 animate-spin motion-reduce:animate-none ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
