'use client';

import React from 'react';
import { isLessonCompleted } from '@gameexplorer/shared';
import { webLessonProgressStore } from '@/lib/lessonProgress';

/**
 * A tick on a lesson the learner has finished.
 *
 * The one client island on an otherwise server-rendered page. It renders
 * nothing until the store has been read, so the server markup and the first
 * client paint agree — reading `localStorage` during render would hydrate
 * against markup the server could not have produced.
 */
export function LessonDoneBadge({ lessonId }: { lessonId: string }) {
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void webLessonProgressStore.load().then((progress) => {
      if (!cancelled) setDone(isLessonCompleted(progress, lessonId));
    });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  if (!done) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success-hover"
      data-testid="lesson-done-badge"
    >
      Done
    </span>
  );
}
