import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef, memo } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
  iconClassName?: string;
  onClick?: () => void;
}

// Optimized number animation — uses a ref to track the rAF ID for cleanup,
// and only triggers when the numeric portion of the value actually changes.
function useAnimatedValue(valueStr: string) {
  const [displayValue, setDisplayValue] = useState(valueStr);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Extract number from string (e.g., "$12,345" -> 12345)
    const numMatch = valueStr.replace(/,/g, '').match(/[\d.]+/);
    if (!numMatch) {
      setDisplayValue(valueStr);
      return;
    }

    const targetNum = parseFloat(numMatch[0]);
    if (isNaN(targetNum)) {
      setDisplayValue(valueStr);
      return;
    }

    // Start closer to target for large numbers to keep animation snappy
    const startNum = targetNum > 100 ? targetNum * 0.85 : 0;
    const duration = 600; // Reduced from 1000ms for snappier feel
    const startTime = performance.now();

    // Pre-compute format options once outside the loop
    const hasFraction = valueStr.includes('.');
    const formatOpts: Intl.NumberFormatOptions = {
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: hasFraction ? 2 : 0,
    };
    const prefix = valueStr.match(/^[^\d]*/)?.[0] || '';
    const suffix = valueStr.match(/[^\d]*$/)?.[0] || '';

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (easeOutQuart)
      const ease = 1 - Math.pow(1 - progress, 4);
      const currentNum = startNum + (targetNum - startNum) * ease;

      const formatted = currentNum.toLocaleString(undefined, formatOpts);
      setDisplayValue(`${prefix}${formatted}${suffix}`);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(valueStr); // Ensure exact final string
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    // Cleanup: cancel any pending animation frame on unmount or value change
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [valueStr]);

  return displayValue;
}

// Memoized to prevent re-renders when parent (dashboard) re-renders
// but this card's props haven't changed
const StatCard = memo(function StatCard({ label, value, icon: Icon, trend, className, iconClassName, onClick }: StatCardProps) {
  const animatedValue = useAnimatedValue(value);

  return (
    <div 
      className={cn(
        "stat-card page-enter relative overflow-hidden group", 
        onClick && "cursor-pointer active:scale-[0.98]",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      aria-label={onClick ? `${label}: ${value}` : undefined}
    >
      {/* Premium glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer" aria-hidden="true" />
      
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-110", 
          iconClassName || "bg-primary/10 text-primary"
        )} aria-hidden="true">
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight shadow-sm",
            trend.positive ? "bg-primary/10 text-primary border border-primary/20" : "bg-foreground/10 text-foreground border border-foreground/20"
          )} aria-label={`Trend: ${trend.positive ? 'up' : 'down'} ${trend.value}`}>
            {trend.positive ? '+' : ''}{trend.value}
          </div>
        )}
      </div>
      
      <div className="min-w-0 relative z-10">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">{label}</p>
        <p className="text-3xl font-black text-foreground tabular-nums tracking-tight truncate drop-shadow-sm font-display" title={value}>
          {animatedValue}
        </p>
      </div>
    </div>
  );
});

export default StatCard;
