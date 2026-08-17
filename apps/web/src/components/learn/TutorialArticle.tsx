import Link from 'next/link';
import type { GameTutorial, TutorialGame } from '@gameexplorer/shared';
import { GradientText, Reveal } from '@/components/visual';
import { TutorialBoard } from './TutorialBoard';

const GAME_META: Record<
  TutorialGame,
  { name: string; icon: string; glowVar: string; hubHref: string; botHref: string }
> = {
  chess: { name: 'Chess', icon: '♔', glowVar: '--shadow-glow-chess', hubHref: '/chess', botHref: '/chess/bot' },
  checkers: { name: 'Checkers', icon: '🔴', glowVar: '--shadow-glow-checkers', hubHref: '/checkers', botHref: '/checkers/bot' },
  reversi: { name: 'Reversi', icon: '⚫', glowVar: '--shadow-glow-reversi', hubHref: '/reversi', botHref: '/reversi/bot' },
  go: { name: 'Go', icon: '⬤', glowVar: '--shadow-glow-go', hubHref: '/go', botHref: '/go/bot' },
  liquidate: { name: 'Liquidate', icon: '🪐', glowVar: '--shadow-glow-liquidate', hubHref: '/liquidate', botHref: '/liquidate/bot' },
};

/**
 * Shared body for the three /{game}/learn pages. Server-renderable: static
 * prose + TutorialBoard diagrams, styled after the privacy page's prose column
 * and the game hubs' hero treatment.
 */
export function TutorialArticle({ tutorial }: { tutorial: GameTutorial }) {
  const meta = GAME_META[tutorial.game];

  return (
    <main className="relative min-h-screen pt-16">
      <div className="container mx-auto px-4 pt-8">
        <Link
          href={meta.hubHref}
          className="inline-flex items-center text-fg-muted hover:text-fg transition-colors group"
        >
          <svg className="w-5 h-5 mr-2 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to {meta.name}
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-14">
          <Reveal
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface-alt border border-border mb-6 motion-safe:animate-float"
            style={{ boxShadow: `var(${meta.glowVar})` }}
          >
            <span className="text-4xl">{meta.icon}</span>
          </Reveal>
          <Reveal as="h1" delay={80} className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            <GradientText>{tutorial.title}</GradientText>
          </Reveal>
          <Reveal as="p" delay={160} className="text-lg text-fg-muted">
            {tutorial.intro}
          </Reveal>
        </div>

        {/* Rules sections */}
        <div className="space-y-12 text-fg-muted leading-relaxed">
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
            </section>
          ))}
        </div>

        {/* Beginner tips */}
        <section className="mt-14 p-6 sm:p-8 rounded-2xl glass">
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
        <div className="mt-14 text-center">
          <p className="text-fg-muted mb-5">Ready to try it for real?</p>
          <Link
            href={meta.botHref}
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-accent text-on-accent font-semibold text-lg hover-lift"
            style={{ boxShadow: `var(${meta.glowVar})` }}
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
