import type { GameTutorial } from './types';

/**
 * Go's rules, for someone who has never played.
 *
 * Two things this tutorial has to do that the others don't. Go's rules really
 * are shorter than chess's — the whole game is "surround to capture, surround to
 * score" — so the risk is not overwhelming the reader but *underselling* the
 * gap between the rules and the game. And the ruleset we ship (area scoring, no
 * dead-stone step) puts one genuine obligation on the player: dead stones have
 * to be captured before passing. That is not a detail, it is the difference
 * between a score that makes sense and one that doesn't, so it gets its own
 * section and its own tip.
 */
export const GO_TUTORIAL: GameTutorial = {
  game: 'go',
  title: 'How to Play Go',
  intro:
    'Go has the simplest rules of any game here and is the hardest to master. ' +
    'Take turns placing stones on a 9×9 grid, surround empty space to claim it, and surround enemy stones to capture them. ' +
    'Whoever controls more of the board when both players pass wins.',
  sections: [
    {
      id: 'setup',
      heading: 'The board and the first move',
      paragraphs: [
        'Go is played on the crossings of a grid, not in the squares. Our boards are 9×9, so there are 81 places to play. The board starts completely empty.',
        'Black plays first, and players alternate. A stone never moves once placed — it either stays where it is for the rest of the game, or it is captured and removed.',
        'The five marked points are the star points. They are only reference marks; nothing special happens on them.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'e5', color: 'black' },
          ],
          highlights: [{ square: 'e5', kind: 'target' }],
          coordinates: true,
          caption: 'Black opens on the centre point, e5. Stones sit on the crossings.',
        },
      ],
    },
    {
      id: 'liberties',
      heading: 'Liberties',
      paragraphs: [
        'Every stone needs breathing room. The empty points directly next to a stone — up, down, left and right, never diagonally — are its liberties.',
        'Stones of the same colour that sit next to each other form a group, and a group shares all of its liberties. A group with plenty of liberties is safe; a group down to one is in danger.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'e5', color: 'white' },
            { square: 'd5', color: 'black' },
            { square: 'f5', color: 'black' },
            { square: 'e6', color: 'black' },
          ],
          highlights: [{ square: 'e4', kind: 'move' }],
          coordinates: true,
          caption: 'The white stone has one liberty left, at e4. Black can take it.',
        },
      ],
    },
    {
      id: 'capture',
      heading: 'Capturing',
      paragraphs: [
        'Fill the last liberty of an enemy group and the whole group is captured — every stone in it comes off the board at once, leaving those points empty for either player.',
        'You may not play a stone that would leave your own group with no liberties. That is self-capture, and it is illegal. The one exception is when the move captures: enemy stones are removed first, and if that gives your stone a liberty, the move is fine.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'e5', color: 'white' },
            { square: 'e6', color: 'white' },
            { square: 'd5', color: 'black' },
            { square: 'd6', color: 'black' },
            { square: 'f5', color: 'black' },
            { square: 'f6', color: 'black' },
            { square: 'e4', color: 'black' },
          ],
          highlights: [
            { square: 'e7', kind: 'capture' },
            { square: 'e5', kind: 'target' },
            { square: 'e6', kind: 'target' },
          ],
          coordinates: true,
          caption: 'Black plays e7 and both white stones are captured — a group lives or dies together.',
        },
      ],
    },
    {
      id: 'ko',
      heading: 'Ko — no repeating the position',
      paragraphs: [
        'Sometimes a capture leaves a position where your opponent could immediately capture straight back, putting the board exactly as it was. That would repeat forever, so it is banned: a move may not recreate a position that has already occurred.',
        'In practice this means you have to play somewhere else first. If your opponent answers that move, the point becomes free again and you can take it back.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'd6', color: 'black' },
            { square: 'c5', color: 'black' },
            { square: 'd4', color: 'black' },
            { square: 'e6', color: 'white' },
            { square: 'f5', color: 'white' },
            { square: 'e4', color: 'white' },
            { square: 'd5', color: 'white' },
          ],
          highlights: [{ square: 'e5', kind: 'move' }],
          coordinates: true,
          caption: 'Black takes at e5, capturing d5. White may not retake at d5 straight away — that is ko.',
        },
      ],
    },
    {
      id: 'life',
      heading: 'Eyes, and groups that cannot be captured',
      paragraphs: [
        'A group with two separate empty points inside it — two eyes — can never be captured. Your opponent would have to fill both to take the last liberty, but filling the first one is self-capture, which is illegal.',
        'This is the single most important idea in the game. Building groups with two eyes is what makes territory yours to keep, and taking the second eye away is how you kill.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'a2', color: 'black' },
            { square: 'a4', color: 'black' },
            { square: 'b1', color: 'black' },
            { square: 'b2', color: 'black' },
            { square: 'b3', color: 'black' },
            { square: 'b4', color: 'black' },
          ],
          highlights: [
            { square: 'a1', kind: 'move' },
            { square: 'a3', kind: 'move' },
          ],
          coordinates: true,
          caption: 'Two eyes, at a1 and a3. White can never fill both — the first would be self-capture — so this group lives forever.',
        },
      ],
    },
    {
      id: 'ending',
      heading: 'Passing, and finishing the game',
      paragraphs: [
        'When there is nothing useful left to play, you pass. If both players pass in a row, the game is over and the board is counted.',
        'You can pass at any time, and passing costs you nothing under our scoring — but it hands the initiative over, so pass only when you genuinely have no move worth making.',
      ],
    },
    {
      id: 'scoring',
      heading: 'Counting the board',
      paragraphs: [
        'We use area scoring: your score is your stones on the board plus every empty point that only you surround. Points touching both colours belong to nobody.',
        'White also receives komi — 7.5 points — as compensation for moving second. The half point means a game can never end in a tie.',
        'One thing to know before you pass: there is no step where you agree which stones are dead. Anything still on the board counts for its owner, so if enemy stones are sitting inside your territory with no way to live, capture them first. It costs you nothing under area scoring, and passing while they stand hands your opponent the points.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'd1', color: 'black' },
            { square: 'd2', color: 'black' },
            { square: 'd3', color: 'black' },
            { square: 'd4', color: 'black' },
            { square: 'd5', color: 'black' },
            { square: 'd6', color: 'black' },
            { square: 'd7', color: 'black' },
            { square: 'd8', color: 'black' },
            { square: 'd9', color: 'black' },
            { square: 'f1', color: 'white' },
            { square: 'f2', color: 'white' },
            { square: 'f3', color: 'white' },
            { square: 'f4', color: 'white' },
            { square: 'f5', color: 'white' },
            { square: 'f6', color: 'white' },
            { square: 'f7', color: 'white' },
            { square: 'f8', color: 'white' },
            { square: 'f9', color: 'white' },
          ],
          coordinates: true,
          caption:
            'Black owns everything left of its wall (36 points) and white everything right of its own (36). The file between them touches both, so it counts for neither.',
        },
      ],
    },
  ],
  tips: [
    'Play in the corners first, then the sides, then the centre — corners take the fewest stones to enclose.',
    'Do not try to save every stone. Giving up two stones to take a bigger group is a good trade.',
    'Count liberties before you fight. The group with more of them usually wins the exchange.',
    'Two eyes means alive. If a group cannot make two, it is going to die eventually — play elsewhere.',
    'Capture dead stones before you pass. Nothing on the board is assumed dead when the score is counted.',
  ],
  ctaLabel: 'Play Go vs a bot',
};
