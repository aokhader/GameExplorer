import Link from 'next/link';
import { LESSONS } from '@gameexplorer/shared';
import type { LessonGame, TutorialGame } from '@gameexplorer/shared';
import { LessonDoneBadge } from './LessonDoneBadge';

/** Games with a coached set. Liquidate has no `PuzzleRules` binding, so no lessons. */
function lessonsFor(game: TutorialGame) {
  return LESSONS[game as LessonGame]?.lessons ?? [];
}

/**
 * The lesson strip on `/{game}/learn`.
 *
 * A **server component**, and that is the point: the rules page keeps its
 * server rendering, its per-route metadata and its no-JS fallback, and gains a
 * list of links. Only the small completion tick is a client island, because
 * "have I done this one" lives in `localStorage` and nothing else on the page
 * needs the browser.
 */
export function LessonIndex({ game }: { game: TutorialGame }) {
  const lessons = lessonsFor(game);
  if (lessons.length === 0) return null;

  return (
    <section className="mt-10" id="lessons" data-testid="lesson-index">
      <h2 className="text-xl font-semibold text-fg mb-1">Coached lessons</h2>
      <p className="text-sm text-fg-muted mb-5">
        {lessons.length} short lessons on a live board. The coach checks every move, explains the
        ones that miss, and never needs you to be signed in.
      </p>

      <ol className="grid gap-3 sm:grid-cols-2">
        {lessons.map((lesson, index) => (
          <li key={lesson.id}>
            <Link
              href={`/${game}/learn/${lesson.id}`}
              className="touch-target motion-control motion-safe:active:scale-[0.98] group flex h-full gap-3 rounded-xl border border-border bg-surface-alt p-4 hover:border-accent/50 hover:bg-surface-hover"
              data-testid="lesson-card"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface-muted text-xs font-bold text-fg">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-fg group-hover:text-accent transition-colors">
                    {lesson.title}
                  </span>
                  <LessonDoneBadge lessonId={lesson.id} />
                </span>
                <span className="mt-1 block text-sm text-fg-muted">{lesson.summary}</span>
                <span className="mt-2 block text-caption text-fg-subtle">
                  {lesson.steps.length} steps · about {lesson.estimatedMinutes} min
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * "Try it" link for a rules section a lesson teaches, or nothing.
 *
 * The gate proves every `teaches` resolves to a real section id, so a renamed
 * heading breaks the build rather than shipping a dead cross-link.
 */
export function SectionLessonLink({ game, sectionId }: { game: TutorialGame; sectionId: string }) {
  const lesson = lessonsFor(game).find((entry) => entry.teaches === sectionId);
  if (!lesson) return null;

  return (
    <Link
      href={`/${game}/learn/${lesson.id}`}
      className="touch-target motion-control motion-safe:active:scale-[0.98] mt-4 inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/20"
      data-testid="section-lesson-link"
    >
      Try it on a board
      <span aria-hidden="true">→</span>
    </Link>
  );
}
