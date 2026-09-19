"use client";

import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { memo, useMemo } from "react";

/**
 * ai-elements `shimmer`, adapted in place.
 *
 * The shipped version calls `motion.create(element)` during render to honour an
 * `as` prop. That resets the component's state on every render and trips
 * `react-hooks/static-components`, so the motion component is now a module-level
 * `motion.span`: the only place this is used is inside a `<button>`, where a
 * `<span>` is the correct element anyway (`<p>` is not phrasing content).
 *
 * `useReducedMotion` is added so the animation is skipped — rather than merely
 * slowed — for readers who ask for reduced motion.
 */

const MotionSpan = motion.span;

export interface TextShimmerProps {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({
  children,
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const prefersReducedMotion = useReducedMotion();

  const dynamicSpread = useMemo(() => children.length * spread, [children, spread]);

  if (prefersReducedMotion) {
    return <span className={cn("inline-block text-muted-foreground", className)}>{children}</span>;
  }

  return (
    <MotionSpan
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={
        {
          "--spread": `${dynamicSpread.toString()}px`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
        } as CSSProperties
      }
      transition={{
        duration,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      {children}
    </MotionSpan>
  );
};

export const Shimmer = memo(ShimmerComponent);

Shimmer.displayName = "Shimmer";
