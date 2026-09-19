import Link from 'next/link';
import type { GameTutorial, TutorialGame } from '@gameexplorer/shared';
import { TutorialBoard } from './TutorialBoard';
import { LessonIndex, SectionLessonLink } from '@/components/lessons/LessonIndex';
import { GameIcon } from '@/components/game/GameIcon';

const GAME_META: Record<
  TutorialGame,
  { name: string; hubHref: string; botHref: string }
> = {
  chess: { name: 'Chess', hubHref: '/chess', botHref: '/chess/bot' },
  checkers: { name: 'Checkers', hubHref: '/checkers', botHref: '/checkers/bot' },
  reversi: { name: 'Reversi', hubHref: '/reversi', botHref: '/reversi/bot' },
  go: { name: 'Go', hubHref: '/go', botHref: '/go/bot' },
  liquidate: { name: 'Liquidate', hubHref: '/liquidate', botHref: '/liquidate/bot' },
};

/**
 * Shared body for the /{game}/learn pages. Server-renderable: static prose +
 * TutorialBoard diagrams, styled after the privacy page's prose column and the
 * game hubs' hero treatment.
 *
 * The coached lessons sit **beside** this article rather than replacing it.
 * These four routes are the SEO surface, they work with JS disabled, and they
 * are the right shape for "I just want to look up en passant" — which a
 * step-gated lesson serves badly. What they gain is a strip of lesson cards
 * under the hero, and a "Try it on a board" link under every section a lesson
 * teaches.
 */
export function TutorialArticle({ tutorial }: { tutorial: GameTutorial }) {
  const meta = GAME_META[tutorial.game];

  return (
    <main className="relative min-h-svh pt-16">
      <div className="container mx-auto px-4 pt-8">
        <Link
          href={meta.hubHref}
          className="inline-flex min-h-11 items-center text-fg-muted hover:text-fg transition-colors group"
        >
          <svg className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to {meta.name}
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* A heading with the game's piece art, not a hero — the rules are
            the page (§6.3). */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <span className="text-4xl inline-flex items-center" aria-hidden="true">
              <GameIcon game={tutorial.game} />
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-fg">{tutorial.title}</h1>
          </div>
          <p className="mt-3 text-lg text-fg-muted">{tutorial.intro}</p>
        </header>

        <LessonIndex game={tutorial.game} />

        {/* Rules sections */}
        <div className="mt-10 space-y-10 text-fg-muted leading-relaxed">
          {tutorial.sections.map(section => (
            <section key={section.id} id={section.id}>
              <h2 className="text-xl font-semibold text-fg mb-3">{section.heading}</h2>
              <div className="space-y-3">
                {section.paragraphs.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
              {section.diagrams?.map((diagram, i) => (
                <TutorialBoard key={i} diagram={diagram} />
              ))}
              <SectionLessonLink game={tutorial.game} sectionId={section.id} />
            </section>
          ))}
        </div>

        {/* Beginner tips */}
        <section className="mt-12 p-6 sm:p-8 rounded-xl border border-border bg-surface-alt">
          <h2 className="text-xl font-semibold text-fg mb-5">Beginner tips</h2>
          <ol className="space-y-4">
            {tutorial.tips.map((tip, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-none inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-muted text-fg text-xs font-bold">
                  {i + 1}
                </span>
                <span className="text-fg-muted leading-relaxed">{tip}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <div className="mt-10 text-center">
          <p className="text-fg-muted mb-5">Ready to try it for real?</p>
          <Link
            href={meta.botHref}
            className="inline-flex min-h-11 items-center justify-center px-8 py-4 rounded-xl bg-accent text-on-accent font-semibold text-lg motion-control motion-safe:active:scale-[0.98] hover:bg-accent-hover"
          >
            {tutorial.ctaLabel}
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
