import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Route-level loading placeholder for the heavy game screens (bot / play /
 * training / analysis). Rendered by each route's `loading.tsx` so a client-side
 * navigation paints an immediate board-shaped skeleton instead of leaving the
 * previous page on screen while the route's JS chunk downloads and executes.
 *
 * Deliberately dependency-free (no engine / board imports) so it lives in the
 * tiny shared loading chunk and shows the instant the navigation starts.
 */
export function GameSkeleton() {
  return (
    <div className="min-h-screen pt-16" aria-busy="true">
      {/* Header bar */}
      <div className="shrink-0 px-4 py-3 border-b border-border-strong dark:border-border">
        <div className="container mx-auto flex items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Board + sidebar */}
      <div className="container mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          {/* Board */}
          <div className="flex items-center justify-center">
            <Skeleton className="w-full max-w-150 aspect-square" />
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
