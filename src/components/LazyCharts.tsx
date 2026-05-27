import { lazy, Suspense, ComponentType } from 'react';

// Lazy load chart components
const ChartsLoader = lazy(() => import('./ChartsLoader'));

// Loading component for charts
const ChartSkeleton = () => (
  <div className="w-full h-80 bg-muted/50 rounded-xl animate-pulse flex items-center justify-center">
    <div className="text-muted-foreground">Loading chart...</div>
  </div>
);

// Higher-order component for lazy loading charts
export function withChartSuspense<P extends object>(
  Component: ComponentType<P>
) {
  return function ChartWrapper(props: P) {
    return (
      <Suspense fallback={<ChartSkeleton />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

// Export lazy-loaded charts
export const LazyCharts = withChartSuspense(ChartsLoader);