import type { Puzzle } from '../../puzzles/types';

/**
 * Composed positions rather than mined games, so every one is sparse enough to
 * read on a phone and every claim in it is checkable: `puzzles.test.ts` proves
 * each mate-in-one is the *only* mate, that a longer mate does not mate sooner,
 * and that a material claim is really collected by the end of the line.
 */
export const CHESS_PUZZLES: Puzzle[] = [
  {
    id: 'chess-001',
    game: 'chess',
    position: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in one.',
    difficulty: 'easy',
    rating: 800,
    themes: ['back-rank', 'mate-in-1'],
    steps: [{ move: 'a1a8' }],
    explanation:
      'Ra8 is mate. The king has no way out along the back rank, and the three pawns it ' +
      'never moved are the reason — f7, g7 and h7 cover every escape square themselves. ' +
      'This is why a "luft" square matters in the endgame.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-002',
    game: 'chess',
    position: 'r5k1/5ppp/8/8/8/8/1R6/1R4K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in two.',
    difficulty: 'medium',
    rating: 1200,
    themes: ['back-rank', 'mate-in-2', 'deflection', 'sacrifice'],
    steps: [
      {
        move: 'b2b8',
        reply: 'a8b8',
        note: 'The rook cannot be declined — capturing is Black’s only legal move.',
      },
      { move: 'b1b8' },
    ],
    explanation:
      'The back rank is already fatal; the only thing holding it together is the rook on a8. ' +
      'Rb8+ offers a rook to remove that defender, and Black has no choice — every king move ' +
      'runs into the rook and there is nothing to interpose. After Rxb8, the second rook ' +
      'recaptures and mates. Doubling the rooks first is what makes the sacrifice work.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-003',
    game: 'chess',
    position: '6k1/8/6K1/8/8/8/8/1Q6 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in one.',
    difficulty: 'easy',
    rating: 650,
    themes: ['mate-in-1', 'endgame'],
    steps: [{ move: 'b1b8' }],
    explanation:
      'Qb8 is mate, and it is the only one. The queen alone cannot mate a king in the open — ' +
      'she needs her own king standing opposite, which is exactly what Kg6 is doing: it takes ' +
      'f7, g7 and h7 away, and the queen only has to cover the back rank. Every other check ' +
      'here lets the king step out.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-004',
    game: 'chess',
    position: '7k/R7/8/8/8/8/8/1R5K w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in one.',
    difficulty: 'easy',
    rating: 700,
    themes: ['mate-in-1', 'endgame'],
    steps: [{ move: 'b1b8' }],
    explanation:
      'The two-rook "ladder". One rook already owns the seventh rank, so the king cannot come ' +
      'down; the other takes the eighth and there is nowhere left. Note which rook moves — ' +
      'checking with the a7 rook instead gives the king h7 and the ladder has to start again.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-005',
    game: 'chess',
    position: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in one.',
    difficulty: 'easy',
    rating: 900,
    themes: ['mate-in-1'],
    steps: [{ move: 'g5f7' }],
    explanation:
      'Smothered mate. Nf7 attacks h8 and the king cannot answer it — g8 is his own rook, g7 ' +
      'and h7 are his own pawns, and no piece can take a knight on f7. A knight is the only ' +
      'piece that can mate a king boxed in by its own men, because it is the only one that ' +
      'jumps over them.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-006',
    game: 'chess',
    position: '7k/3R4/5N2/8/8/8/8/6K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in one.',
    difficulty: 'easy',
    rating: 850,
    themes: ['mate-in-1'],
    steps: [{ move: 'd7h7' }],
    explanation:
      'The Arabian mate — the oldest pattern in the game, and a rook and knight are all it ' +
      'takes. Rh7 would normally just be taken, but the knight on f6 defends it, and the same ' +
      'knight covers g8. Rd8 instead is only a check: the king walks to g7.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-007',
    game: 'chess',
    position: '3q2k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in one.',
    difficulty: 'easy',
    rating: 950,
    themes: ['mate-in-1', 'back-rank'],
    steps: [{ move: 'd1d8' }],
    explanation:
      'The queen is the only thing guarding the back rank, and she is standing on it — so ' +
      'taking her is mate in the same move. Count what a defender is actually doing before ' +
      'trading it: this one was holding the whole eighth rank on her own.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-008',
    game: 'chess',
    position: '5r1k/6pp/7N/3Q4/8/8/8/6K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in two.',
    difficulty: 'hard',
    rating: 1500,
    themes: ['mate-in-2', 'sacrifice', 'deflection'],
    steps: [
      {
        move: 'd5g8',
        reply: 'f8g8',
        note: 'Kxg8 is illegal — the knight on h6 covers that square, so the rook must take.',
      },
      { move: 'h6f7' },
    ],
    explanation:
      'Philidor’s legacy, the most famous smothered mate of all. Qg8+ hands the queen over on ' +
      'a square the king cannot take her on, because the knight guards it. The rook is dragged ' +
      'to g8, where it seals the king’s last flight square itself, and Nf7 mates a king ' +
      'buried by his own pieces.',
    source: 'After Philidor, 1749',
  },
  {
    id: 'chess-009',
    game: 'chess',
    position: 'k7/8/8/1K6/8/8/8/7R w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in two. Checking at once does not work.',
    difficulty: 'medium',
    rating: 1100,
    themes: ['mate-in-2', 'endgame'],
    steps: [
      {
        move: 'b5b6',
        reply: 'a8b8',
        note: 'Not stalemate — b8 is the one square left, and Black has to take it.',
      },
      { move: 'h1h8' },
    ],
    explanation:
      'Rh8 immediately is met by Kb7 and the king is out. The winning move is the quiet one: ' +
      'Kb6 takes a7 and b7 away and leaves Black exactly one move, which walks the king into ' +
      'the corner in front of the rook. This is the opposition — in king-and-rook endings the ' +
      'king does the work and the rook only finishes.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-010',
    game: 'chess',
    position: '5rk1/6pp/8/3N3Q/8/8/8/1K2R3 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in three.',
    difficulty: 'hard',
    rating: 1650,
    themes: ['sacrifice', 'endgame'],
    steps: [
      { move: 'd5e7', reply: 'g8h8', note: 'Kf7 is not available — the queen covers it.' },
      { move: 'h5h7', reply: 'h8h7', note: 'The queen is not defended, so the king must take.' },
      { move: 'e1h1' },
    ],
    explanation:
      'Anastasia’s mate. The knight goes to e7 first, and everything follows from what it ' +
      'covers there: g8 and g6, the two squares the king will want. Then the queen is given ' +
      'up on h7 to drag him onto the open file, and the rook swings across to deliver mate ' +
      'with the knight doing all the quiet work.',
    source: 'After the classic pattern named for Anastasia und das Schachspiel, 1803',
  },
  {
    id: 'chess-011',
    game: 'chess',
    position: '2q3k1/5ppp/8/3N4/8/8/8/6K1 w - - 0 1',
    playerColor: 'white',
    goal: 'win-material',
    goalValue: 9,
    prompt: 'White to play and win the queen.',
    difficulty: 'easy',
    rating: 900,
    themes: ['fork'],
    steps: [{ move: 'd5e7', reply: 'g8h8' }, { move: 'e7c8' }],
    explanation:
      'A family fork. Ne7 hits the king and the queen at the same time, and because one of ' +
      'the two is a check, Black has to answer the check and abandon the other. Look for ' +
      'squares where a knight touches both — they are almost always worth a piece.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-012',
    game: 'chess',
    position: 'r2q2k1/5ppp/8/8/8/8/3R4/3R2K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in two.',
    difficulty: 'medium',
    rating: 1150,
    themes: ['mate-in-2', 'back-rank', 'deflection'],
    steps: [
      { move: 'd2d8', reply: 'a8d8', note: 'The rook is the only piece that can recapture.' },
      { move: 'd1d8' },
    ],
    explanation:
      'Two defenders of the back rank, and two rooks doubled against them. Taking the queen ' +
      'is check, so the rook on a8 has to recapture instead of doing its job, and the second ' +
      'rook comes down behind it. Doubling on the file is what turns one defender too many ' +
      'into one defender too few.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-013',
    game: 'chess',
    position: '1r6/1P6/2K5/8/6k1/8/8/R7 w - - 0 1',
    playerColor: 'white',
    goal: 'win-material',
    goalValue: 8,
    prompt: 'White to play. The pawn is one square from queening — clear its path.',
    difficulty: 'medium',
    rating: 1300,
    themes: ['promotion', 'deflection', 'endgame'],
    steps: [
      { move: 'a1a8', reply: 'b8a8', note: 'Anything else and the pawn simply queens.' },
      { move: 'b7a8q' },
    ],
    explanation:
      'The black rook is doing one job: sitting on b8. Ra8 attacks it and offers a trade it ' +
      'cannot refuse — declining lets the pawn through anyway. Once the rook steps off b8 to ' +
      'take, the pawn promotes with check to boot. Offering a trade is often the cheapest way ' +
      'to remove a blockader.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-014',
    game: 'chess',
    position: '8/k1P1q3/8/8/8/8/8/6K1 w - - 0 1',
    playerColor: 'white',
    goal: 'win-material',
    goalValue: 11,
    prompt: 'White to play. A new queen is not the answer.',
    difficulty: 'hard',
    rating: 1700,
    themes: ['promotion', 'fork'],
    steps: [{ move: 'c7c8n', reply: 'a7a6' }, { move: 'c8e7' }],
    explanation:
      'Promoting to a queen gives no check and lets Black consolidate. A knight does: from c8 ' +
      'it forks the king on a7 and the queen on e7 at once. Underpromotion is almost always ' +
      'about the knight, because a knight is the one piece that moves in a way a queen cannot ' +
      'imitate.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-015',
    game: 'chess',
    position: '8/ppp5/8/PPP5/7k/8/8/7K w - - 0 1',
    playerColor: 'white',
    goal: 'win-material',
    goalValue: 6,
    prompt: 'Three pawns against three, and White to play. Force one through.',
    difficulty: 'hard',
    rating: 1800,
    themes: ['promotion', 'sacrifice', 'endgame'],
    steps: [
      { move: 'b5b6', reply: 'a7b6', note: 'cxb6 loses to the same idea a move later.' },
      { move: 'c5c6', reply: 'b7c6' },
      { move: 'a5a6', reply: 'c6c5', note: 'Nothing stops the a-pawn now — it is two moves clear.' },
      { move: 'a6a7', reply: 'c5c4' },
      { move: 'a7a8q' },
    ],
    explanation:
      'The classic breakthrough. Two pawns are given away to clear one file: b6 pulls a pawn ' +
      'off the a-file, c6 pulls another off the b-file, and the a-pawn walks in untouched. ' +
      'Count the race rather than the pawns — White spends two to promote in three moves, and ' +
      'Black is nowhere near.',
    source: 'The classic three-against-three breakthrough',
  },
  {
    id: 'chess-016',
    game: 'chess',
    position: '2kr4/1p1n4/8/8/2B1QB2/8/8/6K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in two.',
    difficulty: 'hard',
    rating: 1600,
    themes: ['mate-in-2', 'sacrifice', 'deflection'],
    steps: [
      {
        move: 'e4c6',
        reply: 'b7c6',
        note: 'The knight cannot reach c6 and the king has no square — the pawn has to take.',
      },
      { move: 'c4a6' },
    ],
    explanation:
      'Boden’s mate: two bishops on crossing diagonals, and a queen spent to open one of ' +
      'them. Qc6 costs a queen for nothing material, but the b7 pawn must capture, and the ' +
      'moment it leaves b7 the light-squared bishop reaches c8 from a6 while the other covers ' +
      'b8 and c7. The king is mated by his own castled position.',
    source: 'After Boden, 1853',
  },
  {
    id: 'chess-017',
    game: 'chess',
    position: '7k/8/8/6N1/8/8/8/1Q4K1 w - - 0 1',
    playerColor: 'white',
    goal: 'mate',
    prompt: 'White to play and mate in one.',
    difficulty: 'easy',
    rating: 750,
    themes: ['mate-in-1', 'endgame'],
    steps: [{ move: 'b1h7' }],
    explanation:
      'The queen goes right next to the king — legal only because the knight on g5 defends ' +
      'h7. From there she covers g8 and g7 herself. A queen delivering mate on an adjacent ' +
      'square always needs a defender behind her; find the defender first, then the square.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-018',
    game: 'chess',
    position: '6k1/5ppp/4b3/2n5/3P4/8/8/6K1 w - - 0 1',
    playerColor: 'white',
    goal: 'win-material',
    goalValue: 3,
    prompt: 'White to play and win a piece with a pawn.',
    difficulty: 'medium',
    rating: 1000,
    themes: ['fork'],
    steps: [
      { move: 'd4d5', reply: 'c5d7', note: 'Either piece can run; the other one is lost.' },
      { move: 'd5e6' },
    ],
    explanation:
      'A pawn attacks two squares, so a pawn can fork. d5 hits the knight and the bishop at ' +
      'once, and a pawn is worth so much less than either that neither can afford to stay. ' +
      'The cheapest attacker wins the exchange of threats every time.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-019',
    game: 'chess',
    position: 'r5k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1',
    playerColor: 'white',
    goal: 'win-material',
    goalValue: 5,
    prompt: 'White to play and win the rook.',
    difficulty: 'easy',
    rating: 950,
    themes: ['fork'],
    steps: [
      { move: 'd1d5', reply: 'g8f8', note: 'Kh8 walks into mate after Qxa8.' },
      { move: 'd5a8' },
    ],
    explanation:
      'One long diagonal touches the king on g8 and the rook on a8, and the queen only has to ' +
      'find the square where it does both — d5. The check comes first, so the rook has no ' +
      'time to move. Diagonals through a castled king are where a queen fork usually hides.',
    source: 'Composed for Finesse',
  },
  {
    id: 'chess-020',
    game: 'chess',
    position: '7k/7p/8/q3N3/8/8/1B6/6K1 w - - 0 1',
    playerColor: 'white',
    goal: 'win-material',
    goalValue: 9,
    prompt: 'White to play and win the queen.',
    difficulty: 'hard',
    rating: 1450,
    themes: ['discovered-attack', 'fork'],
    steps: [
      { move: 'e5c4', reply: 'h8g8', note: 'Blocking on the diagonal loses the queen too.' },
      { move: 'c4a5' },
    ],
    explanation:
      'The knight is standing in front of its own bishop, and the bishop is aimed at the ' +
      'king. So the knight can move anywhere and the check happens by itself — which means it ' +
      'can move somewhere useful. Nc4 attacks the queen while the bishop gives check, and ' +
      'Black only has time for one of the two problems.',
    source: 'Composed for Finesse',
  },
];
