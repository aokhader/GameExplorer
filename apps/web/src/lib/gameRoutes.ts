import { LESSONS, firstGameElo, type GameId } from '@gameexplorer/shared';
import type { LastSetupMode } from '@gameexplorer/client/game/localSetup';
import type { ContinueItem } from '@gameexplorer/client/game/launcher';
import { resumeHref } from '@/hooks/useUnfinishedGame';

/**
 * Where things live on web, which gives every mode its own route — the one
 * structural difference from native, where `play/[game]` holds every mode.
 * Read by the launcher, the navigation's Play, the game pages and the first-run
 * picker, so none of them spells a route by hand.
 */

const SEGMENT: Record<LastSetupMode, string> = {
  bot: 'bot',
  training: 'training',
  'pass-and-play': 'local',
  online: 'play',
};

/** A mode's setup screen, which reopens on what was chosen last time. */
export function modeHref(game: GameId, mode: LastSetupMode): string {
  return `/${game}/${SEGMENT[mode]}`;
}

/**
 * The same screen, starting straight away with the remembered setup. The setup
 * screens honour `?start=1` only when no unfinished game is waiting, so a link
 * can never start a game over one that is owed a result.
 */
export function startHref(game: GameId, mode: LastSetupMode): string {
  return mode === 'online' ? modeHref(game, mode) : `${modeHref(game, mode)}?start=1`;
}

/**
 * A first game for someone who says they know how to play (§4.4): the bot at
 * the middle of the game's ladder, started at once. Liquidate has no ladder,
 * and its setup is the handful of choices its form opens on.
 */
export function firstGameHref(game: GameId): string {
  if (game === 'liquidate') return '/liquidate/bot?start=1';
  return `/${game}/bot?elo=${firstGameElo(game)}&start=1`;
}

/** The first coached lesson, or the rules page for a game with no lessons. */
export function firstLessonHref(game: GameId): string {
  const set = game === 'liquidate' ? undefined : LESSONS[game];
  const first = set?.lessons[0];
  return first ? `/${game}/learn/${first.id}` : `/${game}/learn`;
}

/**
 * Where a Continue item goes. A board game whose rated result is still owed
 * opens its setup screen, where the Continue card offers to save it; everything
 * else resumes on its own mode's route.
 */
export function continueHref(item: ContinueItem): string {
  if (item.kind === 'liquidate') return `/liquidate/${item.slot}?resume=1`;
  return item.saved.end ? modeHref(item.saved.game, item.saved.mode) : resumeHref(item.saved);
}
