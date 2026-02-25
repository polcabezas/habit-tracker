import { useEffect, useRef } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

export function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Set initial value immediately
  const motionValue = useMotionValue(value);
  
  // Use a spring animation
  const springValue = useSpring(motionValue, {
    damping: 40,
    stiffness: 200,
  });

  // Whenever the prop `value` changes, set the motion target
  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  // Update the textContent of the ref node on every spring frame
  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = Intl.NumberFormat("en-US").format(
          Math.round(latest)
        );
      }
    });
  }, [springValue]);

  return (
    <span
      className={cn("inline-block tabular-nums", className)}
      ref={ref}
    >
      {Intl.NumberFormat("en-US").format(value)}
    </span>
  );
}
