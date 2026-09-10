/**
 * Chess lessons — pure data, proved by `lessons.test.ts` against the real engine.
 *
 * Positions are FEN, exactly as `Puzzle.position` is, and every one of them
 * round-trips through `fenToState`/`stateToFen` unchanged — the gate asserts it,
 * which is what stops a typo becoming a position nobody intended.
 *
 * The micro-positions in `chess-l02` share one frame on purpose: white king e1,
 * black king e8, one black pawn on a7. The pawn is not decoration — without it
 * a lone bishop or knight against a bare king decodes as an immediate draw by
 * insufficient material, and the gate rightly refuses a lesson that opens on a
 * finished game.
 */

import type { Lesson } from '../../lessons/types';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const CHESS_LESSONS: Lesson[] = [
  {
    id: 'chess-l01',
    game: 'chess',
    title: 'The board, and your first move',
    summary: 'Where everything stands, and how to get a piece moving.',
    position: START,
    learnerColor: 'white',
    teaches: 'setup',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'board',
        instruction:
          'White sits at the bottom, black at the top, and white always moves first. The light square goes in the right-hand corner.',
        expect: { kind: 'read' },
        marks: [
          { square: 'h1', kind: 'target', text: 'L' },
          { square: 'a1', kind: 'origin', text: 'D' },
        ],
      },
      {
        id: 'pawn',
        instruction: 'Push any pawn. One square forward, or two on its first move.',
        expect: { kind: 'any', match: { piece: 'pawn' } },
        success: 'That is a pawn move. Pawns are the only pieces that never go backwards.',
        reply: 'e7e5',
        misses: [
          {
            match: { piece: 'knight' },
            say: 'That is a knight, and it is a fine move — but this step wants a pawn.',
          },
          { say: 'Pawns are the eight men on your second rank. Pick one and push it forward.' },
        ],
        marks: [
          { square: 'e4', kind: 'move' },
          { square: 'd4', kind: 'move' },
        ],
      },
      {
        id: 'knight',
        instruction:
          'Black answered in the centre. Now bring out a knight — knights are the only pieces that jump over others.',
        expect: { kind: 'any', match: { piece: 'knight' } },
        success: 'Knights out early is a good habit. They are slow, so they need the head start.',
        misses: [
          {
            match: { piece: 'pawn' },
            say: 'Another pawn move is playable, but the step is about the knights — the two horses on b1 and g1.',
          },
          { say: 'Your knights start on b1 and g1. Move either one.' },
        ],
      },
      {
        id: 'wrap',
        instruction:
          'Two moves in and both sides have a piece doing something. That is the whole opening in miniature: claim the centre, then bring pieces towards it.',
        expect: { kind: 'read' },
      },
    ],
    outro:
      'You have played the first two moves of a chess game. The next lesson walks through what each piece can actually do.',
  },

  {
    id: 'chess-l02',
    game: 'chess',
    title: 'How each piece moves',
    summary: 'Six pieces, six boards, one move each.',
    position: '4k3/p7/8/8/8/8/4P3/4K3 w - - 0 1',
    learnerColor: 'white',
    teaches: 'sliders',
    estimatedMinutes: 6,
    steps: [
      {
        id: 'pawn',
        position: '4k3/p7/8/8/8/8/4P3/4K3 w - - 0 1',
        instruction:
          'The pawn goes straight forward — one square, or two the first time it moves. Push it.',
        expect: { kind: 'any', match: { piece: 'pawn' } },
        success: 'Forward only. A pawn captures diagonally, but it never moves diagonally.',
        marks: [
          { square: 'e3', kind: 'move' },
          { square: 'e4', kind: 'move' },
        ],
      },
      {
        id: 'rook',
        position: '4k3/p7/8/8/8/8/8/R3K3 w - - 0 1',
        instruction: 'The rook runs in straight lines — any distance along a rank or a file.',
        expect: { kind: 'any', match: { piece: 'rook' } },
        success: 'Straight lines, any distance, as long as nothing is in the way.',
        misses: [
          {
            match: { piece: 'king' },
            say: 'That is the king. The rook is the castle on a1 — move that one.',
          },
          { say: 'The rook is on a1. Send it along the a-file or across the first rank.' },
        ],
        marks: [
          { square: 'a1', kind: 'origin' },
          { square: 'a8', kind: 'move' },
          { square: 'd1', kind: 'move' },
        ],
      },
      {
        id: 'bishop',
        position: '4k3/p7/8/8/8/8/8/2B1K3 w - - 0 1',
        instruction: 'The bishop runs diagonally, and so never leaves the colour it starts on.',
        expect: { kind: 'any', match: { piece: 'bishop' } },
        success:
          'Diagonals only. This bishop began on a dark square, so it will spend the whole game on dark squares.',
        misses: [
          {
            match: { piece: 'king' },
            say: 'That is the king. The bishop is on c1.',
          },
          { say: 'The bishop is on c1. Slide it along a diagonal.' },
        ],
        marks: [
          { square: 'c1', kind: 'origin' },
          { square: 'h6', kind: 'move' },
          { square: 'a3', kind: 'move' },
        ],
      },
      {
        id: 'knight',
        position: '4k3/p7/8/8/8/8/8/1N2K3 w - - 0 1',
        instruction:
          'The knight moves in an L: two squares one way, one square across. It is the only piece that jumps.',
        expect: { kind: 'any', match: { piece: 'knight' } },
        success: 'An L every time. From a corner-ish square like b1 there are not many to choose from.',
        misses: [
          {
            match: { piece: 'king' },
            say: 'That is the king. The knight is on b1 — try a3, c3 or d2.',
          },
          { say: 'From b1 the knight reaches a3, c3 and d2. Nothing else is an L.' },
        ],
        marks: [
          { square: 'a3', kind: 'move' },
          { square: 'c3', kind: 'move' },
          { square: 'd2', kind: 'move' },
        ],
      },
      {
        id: 'queen',
        position: '4k3/p7/8/8/8/8/8/3QK3 w - - 0 1',
        instruction: 'The queen is a rook and a bishop in one — straight lines and diagonals.',
        expect: { kind: 'any', match: { piece: 'queen' } },
        success: 'The strongest piece on the board, and the one you should be slowest to expose.',
        misses: [
          { match: { piece: 'king' }, say: 'That is the king. The queen is beside it, on d1.' },
          { say: 'The queen is on d1, and can go almost anywhere from there.' },
        ],
        marks: [{ square: 'd1', kind: 'origin' }],
      },
      {
        id: 'king',
        position: '4k3/p7/8/8/3K4/8/8/7R w - - 0 1',
        instruction:
          'The king moves one square in any direction. Slow, and the only piece you cannot afford to lose. Move it.',
        expect: { kind: 'any', match: { piece: 'king' } },
        success:
          'One square at a time. In the endgame that is enough to make the king a strong piece.',
        misses: [
          {
            match: { piece: 'rook' },
            say: 'That is the rook. The king is the one on d4.',
          },
          { say: 'The king is on d4. One square, any direction.' },
        ],
        marks: [{ square: 'd4', kind: 'origin' }],
      },
    ],
    outro: 'That is every piece. Next: what happens when two of them want the same square.',
  },

  {
    id: 'chess-l03',
    game: 'chess',
    title: 'Taking pieces',
    summary: 'Capture, then take back — the exchange that decides most games.',
    position: 'rnbqkb1r/ppp1pppp/5n2/3p4/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 1',
    learnerColor: 'white',
    teaches: 'pawns',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'intro',
        instruction:
          'A capture is just a move onto an occupied square: your piece lands, theirs comes off. Black has pushed a pawn to d5, right next to your e4 pawn.',
        expect: { kind: 'read' },
        marks: [
          { square: 'e4', kind: 'origin' },
          { square: 'd5', kind: 'capture' },
        ],
      },
      {
        id: 'take',
        instruction: 'Take the d5 pawn with your e-pawn. Pawns capture diagonally forward.',
        expect: { kind: 'any', match: { piece: 'pawn', captures: true } },
        success: 'A pawn for a pawn, so far. Black will want it back.',
        reply: 'f6d5',
        misses: [
          {
            when: ['c3d5'],
            say: 'The knight can take there too — but this step is about the pawn, which captures on a diagonal it can never move along.',
          },
          {
            when: ['e4e5'],
            say: 'Straight ahead is how a pawn moves, not how it captures. Go diagonally, onto d5.',
          },
          { say: 'Your e4 pawn captures diagonally, onto d5.' },
        ],
      },
      {
        id: 'recapture',
        instruction:
          'Black took back with the knight. You are a pawn down until you take back too — recapture on d5.',
        expect: { kind: 'move', moves: ['c3d5'] },
        success:
          'Even again: a pawn each, a knight each. Counting exchanges like this is most of chess.',
        hint: 'Which of your pieces attacks d5?',
        misses: [
          {
            when: ['g1f3', 'g1e2', 'd2d3'],
            say: 'Developing is never silly, but you are a pawn behind right now. Take on d5 first.',
          },
          { say: 'Only one of your pieces attacks d5 — the knight on c3.' },
        ],
        marks: [{ square: 'd5', kind: 'capture' }],
      },
    ],
    outro:
      'Captures come in pairs far more often than they come alone. Before you take, always ask what takes back.',
  },

  {
    id: 'chess-l04',
    game: 'chess',
    title: 'Check, and the three ways out',
    summary: 'Move, block, or capture — there is never a fourth option.',
    position: '4r2k/8/8/8/8/8/8/4K3 w - - 0 1',
    learnerColor: 'white',
    teaches: 'check',
    estimatedMinutes: 5,
    steps: [
      {
        id: 'intro',
        instruction:
          'The black rook attacks your king down the e-file. That is check, and you are not allowed to ignore it.',
        expect: { kind: 'read' },
        marks: [
          { square: 'e1', kind: 'danger' },
          { square: 'e8', kind: 'origin' },
        ],
      },
      {
        id: 'move-away',
        instruction: 'Here you have only one answer: step the king off the e-file.',
        expect: { kind: 'move', moves: ['e1d1', 'e1f1', 'e1d2', 'e1f2'] },
        success: 'Off the line, out of check. That is the first of the three answers.',
        misses: [{ say: 'Move the king to a square the rook does not attack — d1, f1, d2 or f2.' }],
      },
      {
        id: 'block',
        position: '4r2k/8/8/8/R7/8/8/4K3 w - - 0 1',
        instruction:
          'Same check, but now you have a rook on a4. Instead of running, put something in the way.',
        expect: { kind: 'move', moves: ['a4e4'] },
        success: 'Blocked. The rook on e4 stands between the check and your king.',
        hint: 'Your rook already stands on the fourth rank.',
        misses: [
          {
            when: ['e1d1', 'e1f1', 'e1d2', 'e1f2'],
            say: 'Running works — it always does. This step is about the second answer: get in the way.',
          },
          { say: 'Slide the a4 rook along the fourth rank until it stands on the e-file.' },
        ],
        marks: [{ square: 'e4', kind: 'target' }],
      },
      {
        id: 'capture',
        position: '7k/8/8/8/4r3/8/3N4/4K3 w - - 0 1',
        instruction:
          'Check again, this time from e4 — and your knight can reach it. Take the piece giving check.',
        expect: { kind: 'move', moves: ['d2e4'] },
        success:
          'Captured. Move, block, capture: those are the only three answers to a check, in every position ever played.',
        misses: [
          {
            when: ['e1d1', 'e1f1', 'e1f2'],
            say: 'Legal, but you can do better — the checking rook is hanging on e4.',
          },
          { say: 'The knight on d2 reaches e4 in one L-shaped hop.' },
        ],
        marks: [{ square: 'e4', kind: 'capture' }],
      },
    ],
    outro:
      'If none of the three answers exists, the check is checkmate — which is the next lesson.',
  },

  {
    id: 'chess-l05',
    game: 'chess',
    title: 'Checkmate',
    summary: 'Check the king so that none of the three answers is available.',
    position: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    learnerColor: 'white',
    teaches: 'check',
    estimatedMinutes: 5,
    steps: [
      {
        id: 'back-rank',
        instruction:
          'Black’s own pawns have sealed the escape squares. One rook move ends the game — find it.',
        expect: { kind: 'move', moves: ['a1a8'] },
        success:
          'Checkmate. The king cannot move, nothing can block on the eighth rank, and nothing can take the rook.',
        hint: 'Get onto the rank the black king is standing on.',
        misses: [
          {
            when: ['a1a7'],
            say: 'Close — but on a7 the rook attacks nothing that matters, and the king is not in check at all.',
          },
          { say: 'The black king is stuck on the eighth rank. Attack it there.' },
        ],
        marks: [{ square: 'a8', kind: 'target' }],
      },
      {
        id: 'ladder',
        position: '7k/R7/1R6/8/8/8/8/7K w - - 0 1',
        instruction:
          'Two rooks, working as a pair. One already covers the seventh rank. Deliver mate with the other.',
        expect: { kind: 'move', moves: ['b6b8'] },
        success:
          'The ladder: one rook takes away the rank the king stands on, the other takes away the rank it would run to.',
        misses: [
          {
            when: ['a7a8'],
            say: 'That is check, but it gives up the seventh rank — the king simply walks to h7.',
          },
          { say: 'The a7 rook already covers the seventh rank. Bring the other one to the eighth.' },
        ],
      },
      {
        id: 'queen',
        position: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1',
        instruction:
          'Now with the queen. Your king already guards g7 and h7 — the queen only has to cover the rest.',
        expect: { kind: 'move', moves: ['a1a8'] },
        success: 'Mate. The queen takes the eighth rank; your king takes everything else.',
        misses: [
          {
            when: ['a1h1'],
            say: 'Check, but the king steps to g8 and lives. Your king does not cover g8.',
          },
          { say: 'Take the whole eighth rank away, and let your own king do the rest.' },
        ],
      },
      {
        id: 'not-mate',
        position: 'k7/8/1K6/8/8/8/8/7R w - - 0 1',
        instruction:
          'Two rook moves give check here, and only one of them is mate. Play the one that ends the game.',
        expect: { kind: 'move', moves: ['h1h8'] },
        success:
          'Mate. The other check was just a check — and a check the opponent can answer costs you nothing but a tempo.',
        hint: 'Which rank does the black king have no way off?',
        misses: [
          {
            when: ['h1a1'],
            say: 'That is check, but the king walks to b8 — your king covers b7, not b8. Check is not the goal; mate is.',
          },
          { say: 'The king is on a8. Attack along the rank your own king already helps to seal.' },
        ],
      },
    ],
    outro:
      'Mate is not a special move. It is an ordinary check that happens to leave no answer at all.',
  },

  {
    id: 'chess-l06',
    game: 'chess',
    title: 'Castling, en passant, promotion',
    summary: 'The three rules that surprise every beginner.',
    position: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
    learnerColor: 'white',
    teaches: 'castling',
    estimatedMinutes: 5,
    steps: [
      {
        id: 'castle',
        instruction:
          'Castling moves two pieces at once: the king goes two squares towards a rook, and the rook hops over to the far side of it. Castle on the kingside — move the king to g1.',
        expect: { kind: 'move', moves: ['e1g1'] },
        success:
          'The king is tucked into the corner and the rook is developed, in one move. It is the only move in chess that touches two of your own pieces.',
        hint: 'Move the king two squares to the right; the rook comes with it.',
        misses: [
          {
            when: ['e1c1'],
            say: 'That is the queenside castle, and it is perfectly legal — but this step asked for the kingside one, towards h1.',
          },
          {
            when: ['e1f1'],
            say: 'One square is an ordinary king move. Castling goes two.',
          },
          { say: 'Drag the king from e1 to g1. The rook on h1 will jump to f1 by itself.' },
        ],
        marks: [
          { square: 'g1', kind: 'target' },
          { square: 'f1', kind: 'move' },
        ],
      },
      {
        id: 'en-passant',
        position: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        instruction:
          'Black has just pushed a pawn two squares, sliding past your e5 pawn. For this one move only, you may capture it as if it had moved one square — take on d6.',
        expect: { kind: 'move', moves: ['e5d6'] },
        success:
          'En passant, "in passing". Your pawn lands on d6 and the black pawn comes off d5. The right to do it expires immediately.',
        hint: 'Capture onto the empty square behind the black pawn.',
        misses: [
          {
            when: ['e5e6'],
            say: 'Pushing past is exactly what black was hoping for. Capture instead — diagonally, onto d6.',
          },
          { say: 'Move your e5 pawn diagonally to d6. The black pawn on d5 is taken even though you never land on it.' },
        ],
        marks: [
          { square: 'd6', kind: 'target' },
          { square: 'd5', kind: 'capture' },
        ],
      },
      {
        id: 'promotion',
        position: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
        instruction:
          'A pawn that reaches the far rank must become something else. Push it to a8 and take a queen.',
        expect: { kind: 'move', moves: ['a7a8q'] },
        success:
          'A new queen, from a pawn. You may choose a rook, bishop or knight instead — but a queen is right almost every time.',
        misses: [{ say: 'Push the a7 pawn one square, to a8.' }],
        marks: [{ square: 'a8', kind: 'target' }],
      },
    ],
    outro:
      'Three rules, all of them older than the modern game. Nothing else in chess is a special case.',
  },

  {
    id: 'chess-l07',
    game: 'chess',
    title: 'Stalemate, and how to avoid it',
    summary: 'A won position thrown away by taking the last square.',
    position: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
    learnerColor: 'white',
    teaches: 'endings',
    estimatedMinutes: 4,
    steps: [
      {
        id: 'intro',
        instruction:
          'A player with no legal move who is NOT in check is stalemated, and the game is an instant draw — however far ahead the other side is. Queen and king against a bare king is the classic way to throw a win away.',
        expect: { kind: 'read' },
        marks: [
          { square: 'h8', kind: 'danger' },
          { square: 'h7', kind: 'move' },
        ],
      },
      {
        id: 'mate-not-stalemate',
        instruction:
          'Black’s king has exactly one square left: h7. Deliver mate — and be careful, because one natural queen move draws on the spot.',
        expect: { kind: 'move', moves: ['g1g7'] },
        success:
          'Mate. Your king defends the queen on g7, so it cannot be taken, and the king has nowhere left.',
        hint: 'Put the queen next to the king, on a square your own king already guards.',
        misses: [
          {
            when: ['g1g6'],
            say: 'That is the trap. Black is not in check, and has no legal move at all — stalemate, and a draw from a completely winning position.',
          },
          {
            when: ['g1h1'],
            say: 'Check, but the king goes to g7 and the game goes on. Your king covers g7, so look for a move that uses it.',
          },
          {
            when: ['g1g8'],
            say: 'Check — and the king simply takes the queen, because nothing of yours defends g8.',
          },
          { say: 'Your king on f6 already guards g7. Put the queen there.' },
        ],
        marks: [{ square: 'g7', kind: 'target' }],
      },
      {
        id: 'lesson',
        instruction:
          'The rule to carry away: when you are far ahead, count the opponent’s legal moves before you take a square away. Leaving them one harmless move is always better than leaving them none.',
        expect: { kind: 'read' },
      },
    ],
    outro:
      'Stalemate, threefold repetition and the fifty-move rule are all draws. The one you will actually cause is this one.',
  },

  {
    id: 'chess-l08',
    game: 'chess',
    title: 'Fork, pin and skewer',
    summary: 'Three ways to attack two things at once.',
    position: 'r3k3/pp6/8/3N4/8/8/PPP5/4K3 w - - 0 1',
    learnerColor: 'white',
    estimatedMinutes: 6,
    steps: [
      {
        id: 'fork',
        instruction:
          'A fork attacks two pieces with one. Your knight can reach a square that hits the king and the rook together — find it.',
        expect: { kind: 'best', moves: ['d5c7'], depth: 4 },
        success:
          'A family fork. Black must answer the check, and then the rook comes off. Knights fork better than anything else because nothing they attack can attack back.',
        hint: 'Look for a square that touches both e8 and a8.',
        misses: [
          {
            when: ['d5f6'],
            say: 'Check, and a good square — but it only attacks one thing. A fork has to hit two.',
          },
          { say: 'From d5 the knight reaches c7, b6, b4, c3, e3, f4, f6 and e7. Which of those attacks the king AND the rook?' },
        ],
        marks: [
          { square: 'e8', kind: 'danger' },
          { square: 'a8', kind: 'danger' },
        ],
      },
      {
        id: 'pin',
        position: '4k3/8/4n3/8/8/8/8/R6K w - - 0 1',
        instruction:
          'A pin freezes a piece by putting something valuable behind it. Line your rook up with the black king, so the knight cannot move.',
        expect: { kind: 'move', moves: ['a1e1'] },
        success:
          'Pinned. The knight is stuck: moving it would expose its own king, which the rules do not allow at all.',
        hint: 'Which file is the black king on?',
        misses: [
          {
            when: ['a1a8'],
            say: 'Check — and the king simply steps aside. A pin is the opposite idea: leave the king where it is and freeze the piece in front of it.',
          },
          { say: 'The king is on e8 and the knight on e6. Get your rook onto the e-file.' },
        ],
        marks: [
          { square: 'e1', kind: 'target' },
          { square: 'e6', kind: 'danger' },
        ],
      },
      {
        id: 'skewer',
        position: '7r/6k1/8/8/8/4B3/8/6K1 w - - 0 1',
        instruction:
          'A skewer is a pin the other way round: check the valuable piece so it must move, and take what was hiding behind it.',
        expect: { kind: 'best', moves: ['e3d4'], depth: 4 },
        success:
          'The king must step off the diagonal, and the rook behind it falls. Same geometry as a pin — only the order of the two pieces has changed.',
        hint: 'The king and the rook already stand on the same diagonal.',
        misses: [
          {
            when: ['e3c5', 'e3b6', 'e3a7'],
            say: 'Right diagonal, wrong end of it — from there you are not attacking the king, so black is free to move the rook away.',
          },
          { say: 'Find the square where your bishop gives check along the long dark diagonal.' },
        ],
        marks: [
          { square: 'g7', kind: 'danger' },
          { square: 'h8', kind: 'capture' },
        ],
      },
    ],
    outro:
      'Fork, pin, skewer. Almost every tactic you will ever play is one of these three, or two of them at once. The puzzle set is full of them.',
  },
];
