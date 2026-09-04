import type { Puzzle } from '../../puzzles/types';

/**
 * Go puzzles — life and death, and only life and death.
 *
 * That is a decision, not a starting point. Every other game here can be asked
 * "what is the best move" by a search that answers with a number, and the
 * validation suite refuses any puzzle whose key move the engine does not agree
 * with. Go has no such search: its playing engine is Monte-Carlo, asynchronous,
 * and statistical, so a whole-board "best move" Go puzzle could not be *proved*
 * and would sometimes simply be wrong.
 *
 * Inside a stated boundary, though, life and death is a small finite game, and
 * exhaustive search settles it exactly. So every puzzle here carries its own
 * `region` — the frame a tsumego diagram draws — and `target`, the group whose
 * life is the question. `puzzles.test.ts` searches that region and refuses the
 * puzzle unless the answer is **the only** move that works.
 *
 * The set is arranged as a lesson rather than a grab bag. Three-point eye
 * spaces teach that the vital point is the middle; four- and five-point shapes
 * teach that it is the centre of the shape wherever the shape sits, and that
 * the same point both kills and saves depending on who plays first. That last
 * fact is the one every beginner is missing.
 *
 * All positions are **composed for this app** rather than taken from a
 * collection: the shapes themselves are the common property of the game, but
 * published problem sets carry their own editorial copyright and none is worth
 * borrowing to draw a straight three.
 */
export const GO_PUZZLES: Puzzle[] = [
  // ── Easy: three-point eye spaces ──────────────────────────────────────────
  {
    id: 'go-001',
    game: 'go',
    position: '........./........./........./........./OO......./XXO....../.XO....../.XO....../.XO...... w',
    playerColor: 'white',
    goal: 'kill',
    region: ['a1', 'a2', 'a3'],
    target: 'a4',
    prompt: 'White to play. Black has three points of eye space in the corner — take it away.',
    difficulty: 'easy',
    rating: 800,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'a2', reply: 'a1' }, { move: 'a3' }],
    explanation:
      'Play in the middle of the three. Black is left with two separate points and can only ever make one eye, so filling either one is self-capture and the group is dead. Playing at a1 or a3 instead would let Black answer at a2 and live.',
    source: 'Composed for this app',
  },
  {
    id: 'go-002',
    game: 'go',
    position: '........./........./........./........./........./........./.OOOOO.../OXXXXXO../OX...XO.. b',
    playerColor: 'black',
    goal: 'live',
    region: ['c1', 'd1', 'e1'],
    target: 'b1',
    prompt: 'Black to play and live. The group has three points along the edge.',
    difficulty: 'easy',
    rating: 800,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'd1' }],
    explanation:
      'The middle point again — the same one White would take. Filling it splits the space into two separate eyes at c1 and e1, and a group with two eyes can never be captured.',
    source: 'Composed for this app',
  },
  {
    id: 'go-003',
    game: 'go',
    position: '........./........./........./........./........./..OOO..../.OXXXO.../OXX.XO.../OX..XO... w',
    playerColor: 'white',
    goal: 'kill',
    region: ['c1', 'd1', 'd2'],
    target: 'b1',
    prompt: 'White to play. Three points again, but bent this time.',
    difficulty: 'easy',
    rating: 900,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'd1', reply: 'c1' }, { move: 'd2' }],
    explanation:
      'A bent three has a middle too: the point that touches both of the others. Take it and neither of the remaining points can become a second eye.',
    source: 'Composed for this app',
  },
  {
    id: 'go-004',
    game: 'go',
    position: '........./........./........./........./........./OOO....../XXXO...../X.XO...../..XO..... b',
    playerColor: 'black',
    goal: 'live',
    region: ['a1', 'b1', 'b2'],
    target: 'a2',
    prompt: 'Black to play and live in the corner.',
    difficulty: 'easy',
    rating: 900,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'b1' }],
    explanation:
      'Take the bend. a1 and b2 become two separate eyes; play anywhere else and White takes b1, leaving a shape with only one.',
    source: 'Composed for this app',
  },
  {
    id: 'go-005',
    game: 'go',
    position: '........./...OOO.../..OXXXO../.OXX.XO../.OX..XO../.OXXXXO../..OOOO.../........./......... b',
    playerColor: 'black',
    goal: 'live',
    region: ['d5', 'e5', 'e6'],
    target: 'c4',
    prompt: 'Black to play and live. The same three points, out in the open board.',
    difficulty: 'easy',
    rating: 950,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'e5' }],
    explanation:
      'Where the shape sits on the board changes nothing — a bent three lives or dies at its bend. Two eyes at d5 and e6, and the group is settled.',
    source: 'Composed for this app',
  },

  // ── Medium: four-point eye spaces ─────────────────────────────────────────
  {
    id: 'go-006',
    game: 'go',
    position: '........./........./........./........./........./OOO....../XXXO...../X.XXO..../...XO.... w',
    playerColor: 'white',
    goal: 'kill',
    region: ['a1', 'b1', 'c1', 'b2'],
    target: 'a2',
    prompt: 'White to play. Four points of eye space, and one of them matters.',
    difficulty: 'medium',
    rating: 1150,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'b1' }],
    explanation:
      'The shape is a T, and its centre is b1 — the point that touches all three others. Take it and the three remaining points are separate, so no second eye can form. Four points of space is not the same as two eyes.',
    source: 'Composed for this app',
  },
  {
    id: 'go-007',
    game: 'go',
    position: '........./........./........./........./........./..OOO..../.OXXXO.../OXX.XXO../OX...XO.. b',
    playerColor: 'black',
    goal: 'live',
    region: ['c1', 'd1', 'e1', 'd2'],
    target: 'b1',
    prompt: 'Black to play and live. Four points, and only one saves the group.',
    difficulty: 'medium',
    rating: 1200,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'd1' }],
    explanation:
      'Fill the centre of the shape yourself. What is left is three points around it, which split into eyes — and it is exactly the point White needed. Whoever plays the vital point first decides the group.',
    source: 'Composed for this app',
  },
  {
    id: 'go-008',
    game: 'go',
    position: '........./...OOO.../..OXXXO../.OXX.XXO./.OX...XO./.OXXXXXO./..OOOOO../........./......... w',
    playerColor: 'white',
    goal: 'kill',
    region: ['d5', 'e5', 'f5', 'e6'],
    target: 'c4',
    prompt: 'White to play. The same four-point shape, this time in the middle of the board.',
    difficulty: 'medium',
    rating: 1250,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'e5' }],
    explanation:
      'e5 touches all three of the other points, so it is the centre of the shape and the vital point. None of the other three does anything: Black answers at e5 and lives.',
    source: 'Composed for this app',
  },
  {
    id: 'go-009',
    game: 'go',
    position: '........./........./........./........./OO......./XXO....../.XXO...../..XO...../.XXO..... b',
    playerColor: 'black',
    goal: 'live',
    region: ['a1', 'a2', 'a3', 'b2'],
    target: 'a4',
    prompt: 'Black to play and live. Four points, three of them in a line.',
    difficulty: 'medium',
    rating: 1350,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'a2' }],
    explanation:
      'a2 touches a1, a3 and b2 — every other point in the space — so it is the centre of the shape wherever the shape is turned. Take it and three separate eyes are left over; leave it and White takes it instead.',
    source: 'Composed for this app',
  },

  // ── Hard: five-point eye spaces ───────────────────────────────────────────
  {
    id: 'go-010',
    game: 'go',
    position: '........./........./........./........./OO......./XXO....../.XXO...../..XO...../..XO..... w',
    playerColor: 'white',
    goal: 'kill',
    region: ['a1', 'a2', 'a3', 'b1', 'b2'],
    target: 'a4',
    prompt: 'White to play. Five points of eye space in the corner — and it is still not enough.',
    difficulty: 'hard',
    rating: 1500,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'a2', reply: 'b2' }, { move: 'a1' }],
    explanation:
      'a2 is the point with the most neighbours inside the space, which is what "the centre of the shape" means for five points. Black tries b2 to build in the other direction; a1 takes the last eye. Five points of space with no vital point defended is a dead group.',
    source: 'Composed for this app',
  },
  {
    id: 'go-011',
    game: 'go',
    position: '........./........./........./........./..OOO..../.OXXXO.../OXX.XXO../OX...XO../OXX.XXO.. b',
    playerColor: 'black',
    goal: 'live',
    region: ['c2', 'd2', 'e2', 'd1', 'd3'],
    target: 'b1',
    prompt: 'Black to play and live. Five points in a cross.',
    difficulty: 'hard',
    rating: 1550,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'd2' }],
    explanation:
      'The centre of a cross is the point in the middle of it. Filling d2 leaves four separate points around it, which is more than enough for two eyes. Any other move hands White d2 and the whole shape collapses into one eye.',
    source: 'Composed for this app',
  },
  {
    id: 'go-012',
    game: 'go',
    position: '........./........./........./........./........./.OOOO..../OXXXXO.../OX..XXO../OX...XO.. w',
    playerColor: 'white',
    goal: 'kill',
    region: ['c1', 'd1', 'e1', 'c2', 'd2'],
    target: 'b1',
    prompt: 'White to play. Five points along the edge.',
    difficulty: 'hard',
    rating: 1600,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'd1' }],
    explanation:
      'd1 touches c1, e1 and d2 — three of the four other points — so it is the centre of this shape even though the shape is lopsided. Count neighbours, not symmetry.',
    source: 'Composed for this app',
  },
  {
    id: 'go-013',
    game: 'go',
    position: '........./..OOOO.../.OXXXXO../.OX..XXO./.OX...XO./.OXXXXXO./..OOOOO../........./......... w',
    playerColor: 'white',
    goal: 'kill',
    region: ['d5', 'e5', 'f5', 'd6', 'e6'],
    target: 'c4',
    prompt: 'White to play and kill, out in the open board.',
    difficulty: 'hard',
    rating: 1700,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'e5', reply: 'd5' }, { move: 'e6' }],
    explanation:
      'e5 has three neighbours inside the space and every other point has two, so e5 is the vital point. Black takes d5 to try to split the rest; e6 removes the second eye and the group is finished.',
    source: 'Composed for this app',
  },
  {
    id: 'go-014',
    game: 'go',
    position: '........./...OOO.../..OXXXO../.OXX.XXO./.OX...XO./.OXX.XXO./..OXXXO../...OOO.../......... w',
    playerColor: 'white',
    goal: 'kill',
    region: ['d5', 'e5', 'f5', 'e6', 'e4'],
    target: 'c4',
    prompt: 'White to play. A five-point cross, and one move settles it.',
    difficulty: 'hard',
    rating: 1750,
    themes: ['vital-point', 'eye-shape'],
    steps: [{ move: 'e5' }],
    explanation:
      'Take the middle of the cross. The four arms are then separate single points, and a group that can only ever make one eye is dead however much space it looks like it has.',
    source: 'Composed for this app',
  },
];
