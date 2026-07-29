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
    <div className="min-h-screen" aria-busy="true">
      {/* Header bar */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="container mx-auto flex items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Board column + sidebar — mirrors the in-game layout shape. */}
      <div className="container mx-auto px-4 py-4">
        <div className="w-full max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 items-start">
          {/* Player card / board / player card */}
          <div className="flex flex-col gap-3 w-full lg:w-[460px] lg:shrink-0">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="w-full aspect-square" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>

          {/* Sidebar */}
          <div className="w-full lg:flex-1 flex flex-col gap-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
