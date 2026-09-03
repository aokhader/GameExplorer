import { ChessEngine } from '@finesse/shared';
import { getBestMoveElo } from '@finesse/shared';
import type { ChessGameState, Position, PieceType } from '@finesse/shared';

// The worker owns the single source of truth for game state.
let state: ChessGameState = ChessEngine.newGame();

// Build a serializable legal-moves structure (plain array, not Map,
// so it survives the structured-clone crossing the message boundary).
function legalMovesEntries(s: ChessGameState): [Position, Position[]][] {
  if (s.isCheckmate || s.isStalemate || s.isDraw) return [];
  const raw = ChessEngine.getAllLegalMoves(s);
  const map = new Map<Position, Position[]>();
  for (const { from, to } of raw) {
    const list = map.get(from as Position);
    if (list) list.push(to as Position);
    else map.set(from as Position, [to as Position]);
  }
  return [...map.entries()];
}

function broadcastState() {
  self.postMessage({
    type: 'STATE_UPDATE',
    state,
    legalMoves: legalMovesEntries(state),
  });
}

self.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data;

  switch (msg.type) {
    case 'INIT': {
      state = msg.state ?? ChessEngine.newGame();
      broadcastState();
      break;
    }

    case 'MAKE_MOVE': {
      const result = ChessEngine.validateMove(
        state, msg.from, msg.to, false, msg.promotion,
      );
      if (result.valid && result.resultingState) {
        state = result.resultingState;
        broadcastState();
      } else {
        self.postMessage({ type: 'ERROR', message: result.reason ?? 'Illegal move' });
      }
      break;
    }

    // Weak engine (ELO < 1400) — runs here so it never touches main thread.
    // Stockfish stays in its own existing worker.
    case 'GET_BOT_MOVE': {
      try {
        const move = getBestMoveElo(state, msg.elo);
        self.postMessage({ type: 'BOT_MOVE', from: move.from, to: move.to, promotion: move.promotion });
      } catch (err) {
        self.postMessage({ type: 'ERROR', message: String(err) });
      }
      break;
    }

    // ── Stateless compute requests ─────────────────────────────────────────
    // Request/response by requestId; these never touch the worker-owned live
    // `state` above. Used by pages that keep their own timeline (analysis).

    case 'GET_LEGAL_MOVES': {
      self.postMessage({
        type: 'LEGAL_MOVES',
        requestId: msg.requestId,
        legalMoves: legalMovesEntries(msg.state),
      });
      break;
    }

    // Replay a saved game's moves into a timeline of states, so loading a
    // long game doesn't run per-move validation on the main thread.
    case 'REPLAY_MOVES': {
      const timeline: ChessGameState[] = [ChessEngine.newGame()];
      for (const move of msg.moves as { from: Position; to: Position; promotion?: PieceType }[]) {
        const result = ChessEngine.validateMove(
          timeline[timeline.length - 1], move.from, move.to, false, move.promotion,
        );
        if (result.valid && result.resultingState) timeline.push(result.resultingState);
        else break;
      }
      self.postMessage({ type: 'REPLAY_RESULT', requestId: msg.requestId, timeline });
      break;
    }
  }
});