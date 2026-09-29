import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  /** Classe da barra preenchida (cor). */
  indicatorClassName?: string;
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, indicatorClassName, ...props }, ref) => {
    const v = Math.max(0, Math.min(100, value ?? 0));
    return (
      <ProgressPrimitive.Root
        ref={ref}
        value={v}
        className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-200", className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn("h-full w-full flex-1 rounded-full bg-primary transition-all", indicatorClassName)}
          style={{ transform: `translateX(-${100 - v}%)` }}
        />
      </ProgressPrimitive.Root>
    );
  },
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
