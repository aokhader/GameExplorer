/**
 * Go lessons — pure data, proved by `lessons.test.ts`.
 *
 * Positions are the board string `Puzzle.position` already uses, top row first,
 * and `goBoardStringToState` takes the board edge from the row count — so the
 * teaching boards here are **5×5**, which is the right size for a lesson about
 * liberties and eye shape and would be unreadable at 9×9. The two lessons that
 * need room to run (the ladder, and the counted board) use 9×9.
 *
 * Every life-and-death answer below was proved before it was written, by
 * running `tryTsumego` over the stated region: the straight three, the tripod
 * four and the bulky five each came back with **exactly one** winning point.
 * That is not something the runtime re-checks — it is why the answer in the
 * data is the answer.
 */

import type { Lesson } from '../../lessons/types';

const EMPTY_5 = '...../...../...../...../..... b';

export const GO_LESSONS: Lesson[] = [
  {
    id: 'go-l01',
    game: 'go',
    title: 'Stones and liberties',
    summary: 'Stones go on the lines, and live by the empty points beside them.',
    position: EMPTY_5,
    learnerColor: 'black',
    teaches: 'liberties',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'place',
        instruction:
          'Stones go on the intersections, not in the squares, and once placed they never move. Black plays first — put a stone on any of the four marked points.',
        expect: { kind: 'any', match: { toAnyOf: ['b2', 'b4', 'd2', 'd4'] } },
        success:
          'That is the whole of the first rule. From here the game is about which stones stay on the board.',
        reply: 'c3',
        misses: [
          {
            say: 'Any of the four marked points will do — b2, b4, d2 or d4. On a small board those are the corners of the playable area.',
          },
        ],
        marks: [
          { square: 'b2', kind: 'move' },
          { square: 'b4', kind: 'move' },
          { square: 'd2', kind: 'move' },
          { square: 'd4', kind: 'move' },
        ],
      },
      {
        id: 'count',
        position: '...../..X../.XOX./...../..... b',
        instruction:
          'A stone’s liberties are the empty points directly beside it — up, down, left and right, never diagonally. The white stone on c3 started with four. Three are gone, and one is left.',
        expect: { kind: 'read' },
        marks: [{ square: 'c2', kind: 'target', text: '1' }],
      },
      {
        id: 'capture',
        instruction: 'Take the last one. A stone with no liberties comes off the board.',
        expect: { kind: 'move', moves: ['c2'] },
        success:
          'Captured. Your stone on c2 is fine, by the way — it has three liberties of its own.',
        hint: 'Directly below the white stone.',
        misses: [
          {
            match: {},
            say: 'Legal, but it leaves the white stone breathing. Fill its last liberty — the point directly below it.',
          },
          { say: 'Play on c2, the empty point below the white stone.' },
        ],
        marks: [{ square: 'c2', kind: 'capture' }],
      },
    ],
    outro:
      'Liberties are the only thing keeping a stone on the board. Everything else in Go follows from that.',
  },

  {
    id: 'go-l02',
    game: 'go',
    title: 'Capturing a group',
    summary: 'Connected stones share their liberties, and live or die together.',
    position: '...../.XOX./.XOX./..X../..... b',
    learnerColor: 'black',
    teaches: 'capture',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'shared',
        instruction:
          'Stones of the same colour that touch along a line are one group. They share every liberty, and they are captured all together or not at all. These two white stones have exactly one liberty left between them.',
        expect: { kind: 'read' },
        marks: [{ square: 'c5', kind: 'target', text: '1' }],
      },
      {
        id: 'take',
        instruction: 'Fill it and take both stones.',
        expect: { kind: 'move', moves: ['c5'] },
        success:
          'Two stones in one move. A big group is not safer than a small one — it is only safer if it has more liberties.',
        hint: 'Straight above the white group.',
        misses: [
          {
            when: ['b5', 'd5'],
            say: 'That takes a liberty from nothing. The white group breathes through c5 and only c5.',
          },
          { say: 'The point above the top white stone is c5.' },
        ],
        marks: [{ square: 'c5', kind: 'capture' }],
      },
    ],
    outro:
      'Counting a group’s liberties before you attack it — and before you leave it alone — is most of Go’s tactics.',
  },

  {
    id: 'go-l03',
    game: 'go',
    title: 'The point you may not play',
    summary: 'You cannot fill your own last liberty.',
    position: '...../..O../.O.O./..O../..... b',
    learnerColor: 'black',
    teaches: 'self-capture',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'rule',
        instruction:
          'White has surrounded c3 completely. A black stone played there would have no liberty of its own and would capture nothing, so the rules simply refuse the move — the board will not let you place it.',
        expect: { kind: 'read' },
        marks: [{ square: 'c3', kind: 'danger' }],
      },
      {
        id: 'elsewhere',
        instruction:
          'Play somewhere useful instead. b4 takes a liberty from two white stones at once — the one on b3 and the one on c4.',
        expect: { kind: 'move', moves: ['b4'] },
        success:
          'Two stones under pressure from one move. Points that touch several enemy stones are usually the strong ones.',
        hint: 'Above the left-hand white stone.',
        misses: [
          {
            match: {},
            say: 'A legal move, but it touches only one white stone. There is a point that touches two.',
          },
          {
            say: 'If you were trying c3, that is the one point the rules forbid — no liberty, and nothing captured. Try b4 instead.',
          },
        ],
        marks: [{ square: 'b4', kind: 'target' }],
      },
    ],
    outro:
      'The one exception: if a move fills your own last liberty but captures an enemy group in the process, it is legal — because the capture gives the liberty straight back.',
  },

  {
    id: 'go-l04',
    game: 'go',
    title: 'Ko',
    summary: 'You may not take back a single stone immediately.',
    position: '...../.XO../XO.O./.XO../..... b',
    learnerColor: 'black',
    teaches: 'ko',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'shape',
        instruction:
          'This shape is called a ko. The white stone on b3 has one liberty, at c3 — and if you take it, your own stone on c3 will have exactly one liberty too. Without a rule, the two of you could take and retake forever.',
        expect: { kind: 'read' },
        marks: [
          { square: 'b3', kind: 'capture' },
          { square: 'c3', kind: 'target' },
        ],
      },
      {
        id: 'take',
        instruction: 'Capture the white stone on b3.',
        expect: { kind: 'move', moves: ['c3'] },
        success:
          'Taken. White would love to take straight back — but the ko rule forbids recreating the position that was just on the board, so white has to play somewhere else first.',
        reply: 'a5',
        misses: [{ say: 'Play on c3, the empty point in the middle of the shape.' }],
      },
      {
        id: 'threat',
        instruction:
          'White played elsewhere, which is what a ko fight is: both sides look for a move big enough that the opponent must answer it, and only then come back to the ko. That move is called a ko threat.',
        expect: { kind: 'read' },
      },
      {
        id: 'finish',
        instruction:
          'You do not have to play the ko fight at all. Fill at b3 and the whole thing is settled — no ko, no threats, nothing to take back.',
        expect: { kind: 'move', moves: ['b3'] },
        success:
          'Connected and finished. Filling a ko is often worth more than winning it, because it ends the argument.',
        hint: 'The point you just captured on.',
        misses: [
          {
            match: {},
            say: 'That leaves the ko open, and white gets to come back to it. Fill at b3 instead.',
          },
          { say: 'Play b3 — the point where the white stone used to be.' },
        ],
        marks: [{ square: 'b3', kind: 'target' }],
      },
    ],
    outro:
      'Ko is the one place where Go stops being about the board in front of you and starts being about the whole board at once.',
  },

  {
    id: 'go-l05',
    game: 'go',
    title: 'Two eyes',
    summary: 'A group with two separate eyes can never be captured.',
    position: 'OOO../XXO../.XO../.XO../.XO.. b',
    learnerColor: 'black',
    teaches: 'life',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'why',
        instruction:
          'An eye is an empty point surrounded by your own stones. With two of them, an attacker would have to fill both to capture you — and filling the first is itself an illegal self-capture. So two eyes means alive, permanently.',
        expect: { kind: 'read' },
        marks: [
          { square: 'a1', kind: 'target' },
          { square: 'a2', kind: 'move' },
          { square: 'a3', kind: 'target' },
        ],
      },
      {
        id: 'split',
        instruction:
          'Your group has three empty points in a line down the edge. One move turns that single space into two eyes. Find it.',
        expect: { kind: 'move', moves: ['a2'] },
        success:
          'Alive. a1 and a3 are now two separate eyes, and nothing white does can ever take this group off the board.',
        hint: 'The middle of the three.',
        misses: [
          {
            when: ['a1', 'a3'],
            say: 'That fills one end and leaves a single two-point space, which is one eye, not two. White plays the other end and your group is dead.',
          },
          {
            match: {},
            say: 'The move is inside your own space, not outside it. Three points in a row become two eyes only from the middle.',
          },
          { say: 'Play a2, between the two ends.' },
        ],
      },
      {
        id: 'false',
        instruction:
          'Beware the false eye: a point that looks surrounded, but where the stones around it are not actually connected to each other. If an attacker can capture one of them, the eye collapses. Check the diagonals of an eye before you trust it.',
        expect: { kind: 'read' },
      },
    ],
    outro:
      'Every living group in Go has two eyes, or can make them, or shares them with a neighbour. There is no fourth way to live.',
  },

  {
    id: 'go-l06',
    game: 'go',
    title: 'Vital points',
    summary: 'Every eye space has one point that decides whether it lives.',
    position: 'XXXX./OOXX./.OOX./.OOX./.OOX. b',
    learnerColor: 'black',
    teaches: 'life',
    estimatedMinutes: 6,
    steps: [
      {
        id: 'three',
        instruction:
          'White is surrounded with three empty points in a straight line. Kill it — there is exactly one point that works, and it is the same point that would have saved white.',
        expect: { kind: 'move', moves: ['a2'] },
        success:
          'Dead. White can never make two eyes from what is left, and playing either end would be self-capture.',
        hint: 'The middle of the three.',
        misses: [
          {
            when: ['a1', 'a3'],
            say: 'An end point. White answers in the middle and has two eyes — you have just made the group alive.',
          },
          { say: 'Three in a row: play the middle one, a2.' },
        ],
      },
      {
        id: 'four',
        position: '.XXXX/.XXOO/.XOO./.XO../.XOO. b',
        instruction:
          'A four-point space this time, three in a line with one attached at the middle. Same question, other side of the board.',
        expect: { kind: 'move', moves: ['e2'] },
        success:
          'Dead again. The vital point of this shape — a tripod four — is where the three and the extra point meet.',
        hint: 'The point that touches three of the other empty points.',
        misses: [
          {
            when: ['e1', 'e3', 'd2'],
            say: 'One of the arms. White takes the middle and lives with two eyes.',
          },
          { say: 'One empty point here touches all three of the others. That is the one.' },
        ],
      },
      {
        id: 'five',
        position: '..OX./..OX./.OOX./OOXX./XXXX. b',
        instruction:
          'Five points now — a two-by-two block with one extra hanging off it. The vital point is still the one with the most neighbours inside the space.',
        expect: { kind: 'move', moves: ['a4'] },
        success:
          'Dead. Straight three, tripod four, bulky five: they are different shapes with the same idea, and the idea is that the biggest-degree point inside the space decides it.',
        hint: 'Inside the block, next to the point that sticks out.',
        misses: [
          {
            when: ['a5', 'b5', 'b4', 'a3'],
            say: 'Close, but that leaves white room to make two eyes. Count how many of the empty points each candidate touches.',
          },
          { say: 'Look for the empty point with three empty neighbours.' },
        ],
      },
    ],
    outro:
      'This is the whole of beginner life and death: find the eye space, find its vital point, and play there first. The tsumego puzzles drill exactly this.',
  },

  {
    id: 'go-l07',
    game: 'go',
    title: 'Ladders',
    summary: 'Chase a stone into the edge — but count the whole ladder first.',
    position: '.X......./XO......./..X....../........./........./........./........./........./......... b',
    learnerColor: 'black',
    teaches: 'capture',
    estimatedMinutes: 5,
    steps: [
      {
        id: 'idea',
        instruction:
          'A ladder is a chase. You put a stone in atari, it runs, you put it in atari again from the same side — and because the board has an edge, the chase always ends. This white stone has two liberties: b7 and c8.',
        expect: { kind: 'read' },
        marks: [
          { square: 'b7', kind: 'move' },
          { square: 'c8', kind: 'move' },
        ],
      },
      {
        id: 'atari',
        instruction: 'Take one of them. Play b7 and put the stone in atari.',
        expect: { kind: 'move', moves: ['b7'] },
        success: 'One liberty left, at c8. White has to run.',
        reply: 'c8',
        misses: [
          {
            when: ['c8'],
            say: 'Also an atari, and the ladder works from that side too — it just runs down the left edge instead. Take b7 so we can follow one line.',
          },
          { say: 'Play b7, directly below the white stone.' },
        ],
      },
      {
        id: 'again',
        instruction:
          'White ran to c8, and the group has two liberties again: c9 and d8. Take away d8, from the same side as before.',
        expect: { kind: 'move', moves: ['d8'] },
        success: 'Atari again. Notice the staircase — that is what makes it a ladder.',
        reply: 'c9',
        misses: [
          {
            when: ['c9'],
            say: 'That is an atari too, but it pushes white along the ninth line where it runs into your own stone at b9 — messier. Chase from the outside, on d8.',
          },
          { say: 'The group breathes at c9 and d8. Take d8.' },
        ],
      },
      {
        id: 'finish',
        instruction: 'White has run into the edge and has one liberty left. Take it.',
        expect: { kind: 'move', moves: ['d9'] },
        success:
          'Three stones captured. The edge did the work — a ladder is only a threat because the board stops.',
        misses: [{ say: 'One point left: d9.' }],
        marks: [{ square: 'd9', kind: 'capture' }],
      },
      {
        id: 'breaker',
        position: '.X.O...../XO......./..X....../........./........./........./........./........./......... b',
        instruction:
          'Now the same shape with one white stone added on d9 — exactly where you just captured. Run the ladder in your head: white escapes into it, connects, and every stone you played is now a wasted move. Always read a ladder to the edge before you start it; a single stone in its path is called a ladder breaker.',
        expect: { kind: 'read' },
        marks: [{ square: 'd9', kind: 'danger' }],
      },
    ],
    outro:
      'Ladders are the first thing in Go you have to read rather than see. Count them all the way out, every time.',
  },

  {
    id: 'go-l08',
    game: 'go',
    title: 'Ending the game, and counting it',
    summary: 'Two passes, then the empty points are shared out.',
    position:
      '...X.O.../...X.O.../...X.O.../...X.O.../...X.O.../...X.O.../...X.O.../...X.O.../...X.O... b',
    learnerColor: 'black',
    teaches: 'scoring',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'passing',
        instruction:
          'Nobody captures the last stone in Go. The game ends when both players pass in a row, which happens when neither can gain anything by playing. Then any stones that cannot escape are agreed dead and removed, and the board is counted.',
        expect: { kind: 'read' },
      },
      {
        id: 'territory',
        instruction:
          'This board is finished. Black owns the wall on the d-file and the three files behind it; white owns the mirror image. The e-file between the walls touches both colours, so it counts for nobody — those points are called dame.',
        expect: { kind: 'read' },
        marks: [
          { square: 'b5', kind: 'origin', text: 'B' },
          { square: 'h5', kind: 'target', text: 'W' },
          { square: 'e5', kind: 'danger' },
          { square: 'e2', kind: 'danger' },
          { square: 'e8', kind: 'danger' },
        ],
      },
      {
        id: 'komi',
        instruction:
          'Twenty-seven empty points each, and nine stones each — so the two sides are exactly level. White then adds komi, 7.5 points for moving second, and wins by 7.5. The half point exists so that a game can never be tied.',
        expect: { kind: 'read' },
      },
    ],
    outro:
      'That is every rule in Go. Five of them, and a lifetime of consequences — which is rather the point of the game.',
  },
];
