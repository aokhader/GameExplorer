/**
 * "How to play Liquidate".
 *
 * Every rule here is written from scratch for this project. That is deliberate:
 * game *mechanics* are not copyrightable, but the specific wording of a rulebook
 * is, so this text describes our rules in our own words and uses only our own
 * terminology (Credits, star systems, colonies, Warp Gates, Impound, Clearance
 * Pass). See `project-docs/liquidate-plan.md`.
 *
 * No diagrams: the other tutorials illustrate an 8×8 grid, and a ring board has
 * no equivalent — the prose carries it instead.
 */

import type { GameTutorial } from './types';

export const LIQUIDATE_TUTORIAL: GameTutorial = {
  game: 'liquidate',
  title: 'How to Play Liquidate',
  intro:
    'Liquidate is a property-trading game for two to six players set across a ring of planets. You roll dice, claim what you land on, and charge rent to everyone who lands on it afterwards. The last baron still solvent wins — or, in a quick game, whoever is worth the most when the clock runs out.',
  sections: [
    {
      id: 'goal',
      heading: 'The goal',
      paragraphs: [
        'Everyone starts with the same pile of Credits (₡) at Home Station. You win by driving every rival into bankruptcy, so the game is really about turning cash into property, and property into rent that other players cannot afford.',
        'In a quick game there is a round limit instead. When it expires the player with the highest net worth — cash plus everything they hold — takes it.',
      ],
    },
    {
      id: 'turn',
      heading: 'Taking a turn',
      paragraphs: [
        'Roll two dice and move that many tiles around the ring. What happens next depends on where you stop.',
        'Roll a double and you take another turn immediately. Roll two doubles in a row, though, and your ship is flagged as suspicious and sent straight to Impound.',
        'Every time you pass Home Station you collect a stipend. You do not have to stop there to be paid — passing it is enough.',
      ],
    },
    {
      id: 'claiming',
      heading: 'Claiming planets',
      paragraphs: [
        'Land on an unclaimed planet, warp gate, or utility and you may buy it at the listed price.',
        'If you decline, it does not simply stay on the shelf: it goes to auction, and every player — including you — can bid. The highest bidder pays their bid and takes it. This means passing on a cheap tile can hand a rival a bargain, so declining is a real decision rather than a free one.',
      ],
    },
    {
      id: 'rent',
      heading: 'Rent',
      paragraphs: [
        'Land on a tile someone else holds and you owe them rent. You pay automatically — there is no choice to make.',
        'Planets belong to colour-coded star systems. Hold every planet in a system and the bare rent on each of them doubles, even before you build anything. Cornering a system is the single strongest move in the game.',
        'Warp gates work differently: rent depends on how many gates the owner holds, rising steeply from one to all four. Utilities charge a multiple of the dice roll that landed you there, and that multiple triples if the owner holds both.',
      ],
    },
    {
      id: 'building',
      heading: 'Colonies and megastructures',
      paragraphs: [
        'Once you hold a complete star system you can start building. Each colony level raises that planet\'s rent sharply — the jump from the second to the third level is where rent stops being an inconvenience and starts ending games.',
        'You must build evenly across the system. You cannot raise one planet to level three while its neighbours sit bare; every planet has to catch up before any of them can go further. The same applies in reverse when selling: you sell down from the most developed planet first.',
        'Build all the way to the top and the planet becomes a megastructure, the most expensive square on the board to land on.',
      ],
    },
    {
      id: 'money',
      heading: 'Raising cash',
      paragraphs: [
        'Short of Credits? You can mortgage any tile you hold for 60% of its list price. A mortgaged tile collects no rent until you clear the loan, and clearing it costs the amount you borrowed plus interest.',
        'A planet has to be stripped of its colonies before it can be mortgaged — buildings sell back at half what you paid for them.',
        'You can also trade with any other player: planets, gates, utilities and Credits in any combination, as long as both sides agree. Developed planets must be sold down to bare land before they change hands.',
      ],
    },
    {
      id: 'impound',
      heading: 'Impound',
      paragraphs: [
        'A Contraband Scan, an unlucky card, or two doubles in a row will land your ship in Impound. While held there you do not move, but you also cannot be charged rent — which late in the game is often the safest place on the board.',
        'There are three ways out: pay the release fee, roll doubles, or spend a Clearance Pass if you are holding one. Fail to roll doubles two turns running and you must pay the fee anyway.',
      ],
    },
    {
      id: 'decks',
      heading: 'Anomaly and Federation cards',
      paragraphs: [
        'Two tile types make you draw a card. Anomalies tend to move your ship — slipstreams, dust drag, a beacon that reroutes you to the nearest warp gate. Federation cards tend to move money: grants, audits, levies, and refunds.',
        'Either deck can send you to Impound, and either can hand you a Clearance Pass, which you keep until you spend it.',
      ],
    },
    {
      id: 'bankruptcy',
      heading: 'Going under',
      paragraphs: [
        'If a bill arrives that you cannot cover, you have to raise the money by selling buildings or mortgaging property. If you cannot raise enough, you are out, and everything you hold passes to whoever you owed — or back to the bank if the debt was owed to the bank.',
        'Before the game starts you choose how strict this is. The forgiving setting lets your balance drop below zero and gives you the chance to trade your way back to solvency. The strict setting never lets a balance go below zero: the creditor takes whatever cash you have and you are out on the spot.',
      ],
    },
  ],
  tips: [
    'Buy aggressively in the opening. Empty tiles earn nothing, and the cheap ones only stay cheap for one lap.',
    'A complete system beats a scattered collection of expensive planets — three cheap planets you fully own outearn one flagship you do not.',
    'Keep a cash reserve. Being asset-rich and cash-poor is how most players go bankrupt.',
    'Bid in auctions even on tiles you do not want, if a rival is one planet away from completing a system.',
    'Late in the game, sitting in Impound is often better than moving — you cannot pay rent from a holding cell.',
  ],
  ctaLabel: 'Play a game',
};
