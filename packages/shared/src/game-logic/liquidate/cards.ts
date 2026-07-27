/**
 * The two event decks — **all card text and values authored for this project.**
 *
 * Effects are layout-agnostic (relative moves and tile-kind searches, never
 * absolute tile indices) so the same decks shuffle into both the 44-tile and
 * 28-tile boards. Deck order is produced by the seeded RNG at `newGame`, so a
 * game's draws are reproducible from its seed.
 *
 * `anomaly` skews toward movement and hazard; `federation` skews toward money
 * and paperwork, which keeps the two decks feeling distinct in play.
 */

import type { CardDeck, LiquidateCard } from './types';

const ANOMALY: readonly LiquidateCard[] = [
  {
    id: 'an-slipstream',
    deck: 'anomaly',
    text: 'A slipstream current catches your hull. Advance 3 tiles.',
    effect: { kind: 'move-by', steps: 3 },
  },
  {
    id: 'an-drag',
    deck: 'anomaly',
    text: 'Dust drag bleeds your momentum. Drift back 3 tiles.',
    effect: { kind: 'move-by', steps: -3 },
  },
  {
    id: 'an-beacon',
    deck: 'anomaly',
    text: 'A derelict beacon reroutes you to the nearest warp gate.',
    effect: { kind: 'advance-to-nearest', tileKind: 'warp-gate' },
  },
  {
    id: 'an-surge',
    deck: 'anomaly',
    text: 'Power surge detected. Report to the nearest utility.',
    effect: { kind: 'advance-to-nearest', tileKind: 'utility' },
  },
  {
    id: 'an-sweep',
    deck: 'anomaly',
    text: 'A customs sweep flags your manifest. Report to Impound.',
    effect: { kind: 'go-to-impound' },
  },
  {
    id: 'an-salvage',
    deck: 'anomaly',
    text: 'You salvage a drifting cargo pod. Collect 120.',
    effect: { kind: 'collect', amount: 120 },
  },
  {
    id: 'an-microdebris',
    deck: 'anomaly',
    text: 'Microdebris shreds a solar sail. Pay 90 for repairs.',
    effect: { kind: 'pay', amount: 90 },
  },
  {
    id: 'an-clearance',
    deck: 'anomaly',
    text: 'A friendly inspector waves you through. Keep this Clearance Pass.',
    effect: { kind: 'clearance-pass' },
  },
  {
    id: 'an-long-burn',
    deck: 'anomaly',
    text: 'A long burn takes you all the way around. Advance to Home Station.',
    effect: { kind: 'advance-to-home' },
  },
  {
    id: 'an-toll',
    deck: 'anomaly',
    text: 'Every captain pays into the rescue fund. Collect 40 from each rival.',
    effect: { kind: 'collect-from-each', amount: 40 },
  },
  {
    id: 'an-flare',
    deck: 'anomaly',
    text: 'A stellar flare scrambles navigation. Drift back 2 tiles.',
    effect: { kind: 'move-by', steps: -2 },
  },
  {
    id: 'an-shortcut',
    deck: 'anomaly',
    text: 'You thread an uncharted shortcut. Advance 5 tiles.',
    effect: { kind: 'move-by', steps: 5 },
  },
];

const FEDERATION: readonly LiquidateCard[] = [
  {
    id: 'fd-grant',
    deck: 'federation',
    text: 'Your colony survey is approved. Collect 200.',
    effect: { kind: 'collect', amount: 200 },
  },
  {
    id: 'fd-dividend',
    deck: 'federation',
    text: 'Federation bonds mature. Collect 150.',
    effect: { kind: 'collect', amount: 150 },
  },
  {
    id: 'fd-audit',
    deck: 'federation',
    text: 'An audit finds irregularities. Pay 150.',
    effect: { kind: 'pay', amount: 150 },
  },
  {
    id: 'fd-levy',
    deck: 'federation',
    text: 'Orbital maintenance levy. Pay 75.',
    effect: { kind: 'pay', amount: 75 },
  },
  {
    id: 'fd-rebate',
    deck: 'federation',
    text: 'Overpaid docking fees are refunded. Collect 60.',
    effect: { kind: 'collect', amount: 60 },
  },
  {
    id: 'fd-clearance',
    deck: 'federation',
    text: 'Your paperwork is finally in order. Keep this Clearance Pass.',
    effect: { kind: 'clearance-pass' },
  },
  {
    id: 'fd-recall',
    deck: 'federation',
    text: 'A licensing recall summons you to Impound.',
    effect: { kind: 'go-to-impound' },
  },
  {
    id: 'fd-charter',
    deck: 'federation',
    text: 'Charter renewal is due to every rival. Pay 50 to each.',
    effect: { kind: 'pay-each', amount: 50 },
  },
  {
    id: 'fd-settlement',
    deck: 'federation',
    text: 'A class-action settlement lands in your favour. Collect 45 from each rival.',
    effect: { kind: 'collect-from-each', amount: 45 },
  },
  {
    id: 'fd-summons',
    deck: 'federation',
    text: 'You are summoned to Home Station for a hearing. Advance there.',
    effect: { kind: 'advance-to-home' },
  },
  {
    id: 'fd-inheritance',
    deck: 'federation',
    text: 'A distant relative leaves you their claim. Collect 100.',
    effect: { kind: 'collect', amount: 100 },
  },
  {
    id: 'fd-tax',
    deck: 'federation',
    text: 'Back taxes come due on your holdings. Pay 110.',
    effect: { kind: 'pay', amount: 110 },
  },
];

/** Every card, indexed by id, for cheap lookup from the id-based deck state. */
const BY_ID: Record<string, LiquidateCard> = Object.fromEntries(
  [...ANOMALY, ...FEDERATION].map((card) => [card.id, card]),
);

/** All card ids for a deck, in authored order (shuffled by the engine). */
export function deckCardIds(deck: CardDeck): string[] {
  return (deck === 'anomaly' ? ANOMALY : FEDERATION).map((c) => c.id);
}

/** Look up a card definition. Throws only on a corrupted save. */
export function cardById(id: string): LiquidateCard {
  const card = BY_ID[id];
  if (!card) throw new Error(`unknown Liquidate card: ${id}`);
  return card;
}

/** Every card in a deck — handy for tests and rules screens. */
export function deckCards(deck: CardDeck): readonly LiquidateCard[] {
  return deck === 'anomaly' ? ANOMALY : FEDERATION;
}
