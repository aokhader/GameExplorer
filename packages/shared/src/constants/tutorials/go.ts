import type { GameTutorial } from './types';

/**
 * Go's rules, for someone who has never played.
 *
 * Go's rules really are shorter than chess's — the whole game is "surround to
 * capture, surround to score" — so the risk here is not overwhelming the reader
 * but leaving them holding a set of rules with no idea how the game ends. Two
 * things get the most room as a result, because they are what a first game
 * actually founders on: **what makes a group safe** (two eyes), and **how the
 * board is counted**.
 *
 * The counting section is a worked example rather than a description. Every
 * point on that board is shaded with the side it counts for, and its numbers
 * are checked against the engine by `tutorials.test.ts` — including under both
 * scoring rules, so the section that says the two rulesets disagree by nine
 * points cannot drift away from the two rulesets.
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
        'Black plays first, and players alternate. A stone never moves once placed. It stays where it is for the rest of the game, or it is captured and removed.',
        'The five marked points are the star points. They are reference marks and nothing more.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [{ square: 'e5', color: 'black' }],
          highlights: [{ square: 'e5', kind: 'target' }],
          labels: [{ square: 'e5', text: '1' }],
          coordinates: true,
          caption: 'Black opens on the centre point, E5. Stones sit on the crossings, not in the squares.',
        },
      ],
    },
    {
      id: 'liberties',
      heading: 'Liberties',
      paragraphs: [
        'Every stone needs breathing room. The empty points directly next to it — up, down, left and right, never diagonally — are its liberties.',
        'Stones of the same colour sitting next to each other form a group, and a group shares all of its liberties. A group with plenty of them is safe. A group down to one is about to be captured.',
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
          labels: [{ square: 'e4', text: 'a' }],
          coordinates: true,
          caption: 'The white stone has one liberty left, at a. Black plays there and the stone comes off.',
        },
      ],
    },
    {
      id: 'capture',
      heading: 'Capturing',
      paragraphs: [
        'Fill the last liberty of an enemy group and the whole group is captured. Every stone in it comes off the board at once, and the points it stood on are empty again for either player.',
        'A group lives or dies together. Two stones side by side are captured as one, not one at a time.',
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
          labels: [{ square: 'e7', text: '1' }],
          coordinates: true,
          caption: 'Black plays 1 and both white stones are captured — the ringed pair comes off together.',
        },
      ],
    },
    {
      id: 'self-capture',
      heading: 'You may not fill your own last liberty',
      paragraphs: [
        'Playing a stone that would leave its own group with no liberties is illegal. You cannot hand your stones over by placing them inside enemy space.',
        'There is one exception, and it is the whole reason the rule is worth stating: if the move captures, the enemy stones come off first. If that leaves your stone a liberty, the move is perfectly legal.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'd5', color: 'white' },
            { square: 'f5', color: 'white' },
            { square: 'e6', color: 'white' },
            { square: 'e4', color: 'white' },
          ],
          labels: [{ square: 'e5', text: 'a' }],
          coordinates: true,
          caption: 'Black may not play at a. The stone would have no liberties and captures nothing, so the board refuses it.',
        },
      ],
    },
    {
      id: 'ko',
      heading: 'Ko — no repeating the position',
      paragraphs: [
        'Sometimes a capture leaves a position where your opponent could take straight back, putting the board exactly as it was. That would repeat forever, so it is banned: a move may not recreate a position that has already occurred.',
        'In practice you have to play somewhere else first. If your opponent answers that move, the point is free again and you can take it back.',
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
          labels: [{ square: 'e5', text: '1' }, { square: 'd5', text: 'a' }],
          coordinates: true,
          caption: 'Black plays 1 and captures a. White may not retake at a straight away — that is ko.',
        },
      ],
    },
    {
      id: 'life',
      heading: 'Two eyes, and groups that cannot be captured',
      paragraphs: [
        'A group with two separate empty points inside it — two eyes — can never be captured. To take the last liberty your opponent would have to fill both, and filling the first one is self-capture, which the previous rule forbids.',
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
          labels: [{ square: 'a1', text: 'a' }, { square: 'a3', text: 'b' }],
          coordinates: true,
          caption: 'Two eyes, at a and b. White can never fill both — the first would be self-capture — so this group lives forever.',
        },
      ],
    },
    {
      id: 'dead-stones',
      heading: 'Dead stones',
      paragraphs: [
        'A group that can never make two eyes and has nowhere to run is dead, even while it is still sitting on the board. Its owner could keep defending it and would only lose more stones.',
        'Experienced players stop playing those sequences out — everybody can see how they end. The stones simply come off when the game is counted.',
        'You do not have to spot this yourself. When the game ends the app marks every group it can prove is dead, shows you, and lets you disagree.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'a1', color: 'black' },
            { square: 'b1', color: 'black' },
            { square: 'c1', color: 'black' },
            { square: 'd1', color: 'black' },
            { square: 'a2', color: 'black' },
            { square: 'b2', color: 'black' },
            { square: 'd2', color: 'black' },
            { square: 'd3', color: 'black' },
            { square: 'a5', color: 'black' },
            { square: 'b5', color: 'black' },
            { square: 'c5', color: 'black' },
            { square: 'd5', color: 'black' },
            { square: 'd4', color: 'black' },
            { square: 'a4', color: 'white' },
            { square: 'b4', color: 'white' },
            { square: 'c3', color: 'white' },
          ],
          highlights: [
            { square: 'a4', kind: 'capture' },
            { square: 'b4', kind: 'capture' },
            { square: 'c3', kind: 'capture' },
          ],
          coordinates: true,
          caption: 'The three ringed white stones are dead. There is not enough room in that pocket for two eyes, so they come off when the board is counted.',
        },
      ],
    },
    {
      id: 'ending',
      heading: 'Passing, and finishing the game',
      paragraphs: [
        'When there is nothing useful left to play, you pass. Two passes in a row stop the game.',
        'They do not end it. What happens next is the review: dead groups are taken off the board, and you either accept the score or go back and play on. If you think a group marked dead could actually live, resume and prove it.',
        'You can pass at any time, but it hands the initiative over — so pass only when you genuinely have no move worth making.',
      ],
    },
    {
      id: 'scoring',
      heading: 'Counting the board',
      paragraphs: [
        'Your score is your stones on the board plus every empty point that only you surround. A point touching both colours belongs to nobody.',
        'The board below is finished and counted. Black has a wall of nine stones and the three files behind it — 27 empty points — for 36. White has exactly the same on the other side. The file between the walls touches both, so it counts for neither.',
        'White also receives komi, 7.5 points, as compensation for moving second. That makes the final score Black 36, White 43.5 — White wins by 7.5. The half point is deliberate: it means a game can never end in a tie.',
      ],
      diagrams: [
        {
          game: 'go',
          size: 9,
          pieces: [
            { square: 'd1', color: 'black' }, { square: 'd2', color: 'black' },
            { square: 'd3', color: 'black' }, { square: 'd4', color: 'black' },
            { square: 'd5', color: 'black' }, { square: 'd6', color: 'black' },
            { square: 'd7', color: 'black' }, { square: 'd8', color: 'black' },
            { square: 'd9', color: 'black' },
            { square: 'f1', color: 'white' }, { square: 'f2', color: 'white' },
            { square: 'f3', color: 'white' }, { square: 'f4', color: 'white' },
            { square: 'f5', color: 'white' }, { square: 'f6', color: 'white' },
            { square: 'f7', color: 'white' }, { square: 'f8', color: 'white' },
            { square: 'f9', color: 'white' },
          ],
          territory: [
            { square: 'a1', owner: 'black' }, { square: 'b1', owner: 'black' }, { square: 'c1', owner: 'black' }, { square: 'e1', owner: 'neutral' }, { square: 'g1', owner: 'white' }, { square: 'h1', owner: 'white' }, { square: 'i1', owner: 'white' },
            { square: 'a2', owner: 'black' }, { square: 'b2', owner: 'black' }, { square: 'c2', owner: 'black' }, { square: 'e2', owner: 'neutral' }, { square: 'g2', owner: 'white' }, { square: 'h2', owner: 'white' }, { square: 'i2', owner: 'white' },
            { square: 'a3', owner: 'black' }, { square: 'b3', owner: 'black' }, { square: 'c3', owner: 'black' }, { square: 'e3', owner: 'neutral' }, { square: 'g3', owner: 'white' }, { square: 'h3', owner: 'white' }, { square: 'i3', owner: 'white' },
            { square: 'a4', owner: 'black' }, { square: 'b4', owner: 'black' }, { square: 'c4', owner: 'black' }, { square: 'e4', owner: 'neutral' }, { square: 'g4', owner: 'white' }, { square: 'h4', owner: 'white' }, { square: 'i4', owner: 'white' },
            { square: 'a5', owner: 'black' }, { square: 'b5', owner: 'black' }, { square: 'c5', owner: 'black' }, { square: 'e5', owner: 'neutral' }, { square: 'g5', owner: 'white' }, { square: 'h5', owner: 'white' }, { square: 'i5', owner: 'white' },
            { square: 'a6', owner: 'black' }, { square: 'b6', owner: 'black' }, { square: 'c6', owner: 'black' }, { square: 'e6', owner: 'neutral' }, { square: 'g6', owner: 'white' }, { square: 'h6', owner: 'white' }, { square: 'i6', owner: 'white' },
            { square: 'a7', owner: 'black' }, { square: 'b7', owner: 'black' }, { square: 'c7', owner: 'black' }, { square: 'e7', owner: 'neutral' }, { square: 'g7', owner: 'white' }, { square: 'h7', owner: 'white' }, { square: 'i7', owner: 'white' },
            { square: 'a8', owner: 'black' }, { square: 'b8', owner: 'black' }, { square: 'c8', owner: 'black' }, { square: 'e8', owner: 'neutral' }, { square: 'g8', owner: 'white' }, { square: 'h8', owner: 'white' }, { square: 'i8', owner: 'white' },
            { square: 'a9', owner: 'black' }, { square: 'b9', owner: 'black' }, { square: 'c9', owner: 'black' }, { square: 'e9', owner: 'neutral' }, { square: 'g9', owner: 'white' }, { square: 'h9', owner: 'white' }, { square: 'i9', owner: 'white' },
          ],
          coordinates: true,
          caption:
            'Every point is marked with the side it counts for. Dark squares are Black’s 27, pale squares White’s 27, and the dashed squares down the E file belong to nobody.',
        },
      ],
    },
    {
      id: 'rulesets',
      heading: 'Two ways to count, and komi',
      paragraphs: [
        'The setup screen offers two scoring rules, and the board above shows the difference. Area scoring counts your stones as well as your territory: 36 each. Territory scoring counts only the empty points you surround, plus any enemy stones you captured: 27 each. Either way White wins by the same 7.5, which is usually how it goes — the two rules almost never disagree about who won.',
        'What they do change is the last few moves. Under area scoring a neutral point is free to fill, so there is no harm in playing it. Under territory scoring filling your own space costs you a point, so you stop earlier.',
        'Komi is the compensation White gets for moving second, and you can change it too. The standard 7.5 makes a tie impossible; set it to a whole number and a level game becomes possible, which is a real Go result.',
      ],
    },
    {
      id: 'board-sizes',
      heading: 'Which board to play on',
      paragraphs: [
        'Everything on this page is the whole of Go, and it is the same game on every board. 9×9 is where to learn it: a game takes ten minutes, every move touches every other, and you will see a group live or die within a few moves of the fight starting.',
        '13×13 is the first size with room for more than one thing to be happening at once, and it is where direction starts to matter more than reading. 19×19 is the board the game is really played on — four corners, four sides, and enough space that a fight you lose can be worth losing.',
        'Only 9×9 at 7.5 komi counts towards a rating. The bot’s difficulty tiers were measured there, and it is genuinely weaker on a bigger board: it works out a move by playing the game to the end thousands of times, and there is a great deal more game to play on 361 points than on 81. Every other setting is casual, and says so on the setup screen.',
      ],
    },
  ],
  tips: [
    'Play in the corners first, then the sides, then the centre — corners take the fewest stones to enclose.',
    'Do not try to save every stone. Giving up two to take a bigger group is a good trade.',
    'Count liberties before you fight. The group with more of them usually wins the exchange.',
    'Two eyes means alive. If a group cannot make two, it is going to die — play elsewhere and take the points.',
    'Stuck on life and death? The puzzles are all one question: which point settles this group.',
  ],
  ctaLabel: 'Play Go vs a bot',
};
