import { LESSONS } from '@gameexplorer/shared';
import type { LessonGame } from '@gameexplorer/shared';
import type { Metadata } from 'next';

/**
 * The route furniture the four `/{game}/learn/[lesson]` pages share.
 *
 * Kept out of the page files because Next requires `generateStaticParams` and
 * `generateMetadata` to be *exported from the page*, which would otherwise mean
 * four copies of the same twelve lines — and this repo has watched
 * hand-maintained per-game lists go stale six times.
 */

export function lessonStaticParams(game: LessonGame): Array<{ lesson: string }> {
  return LESSONS[game].lessons.map((lesson) => ({ lesson: lesson.id }));
}

export function findLesson(game: LessonGame, id: string) {
  return LESSONS[game].lessons.find((lesson) => lesson.id === id) ?? null;
}

const GAME_LABEL: Record<LessonGame, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
  go: 'Go',
};

export function lessonMetadata(game: LessonGame, id: string): Metadata {
  const lesson = findLesson(game, id);
  if (!lesson) return { title: `${GAME_LABEL[game]} lesson — Finesse` };

  return {
    title: `${lesson.title} — ${GAME_LABEL[game]} lesson — Finesse`,
    description: `${lesson.summary} A coached ${GAME_LABEL[game].toLowerCase()} lesson on a live board, about ${lesson.estimatedMinutes} minutes, no account needed.`,
  };
}
