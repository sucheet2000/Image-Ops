"use client";

import { useScramble } from "../../hooks/useScramble";

type ScrambleNumberProps = {
  value: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
};

export default function ScrambleNumber({
  value,
  suffix = "",
  decimals = 0,
  duration = 1400,
  className = ""
}: ScrambleNumberProps) {
  const { display, ref } = useScramble(value, suffix, { duration, decimals });
  return (
    <span ref={ref} className={className} aria-label={`${value}${suffix}`} aria-live="polite">
      {display}
    </span>
  );
}
