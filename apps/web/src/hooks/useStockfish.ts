// apps/web/src/hooks/useStockfish.ts
import { useEffect, useRef, useState, useCallback } from 'react';

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  
  // We use a ref to store the 'resolve' function of the active Promise
  const moveResolverRef = useRef<((move: { from: string, to: string }) => void) | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      workerRef.current = new Worker('/stockfish/stockfish.js');

      // Send the initial UCI command ONCE right after the worker is created
      workerRef.current.postMessage('uci');

      workerRef.current.onmessage = (e) => {
        const message = typeof e.data === 'string' ? e.data : e.data.data;
        
        // Uncomment the line below if you want to see engine output for debugging
        // console.log('Stockfish:', message);

        if (message === 'uciok') {
          setIsReady(true);
          console.log('✅ Engine Ready for Commands');
          workerRef.current?.postMessage('isready');
        }

        // When the engine finds the best move, resolve the active Promise
        if (typeof message === 'string' && message.startsWith('bestmove')) {
          const moveStr = message.split(' ')[1]; // Extracts "e2e4"
          
          if (moveStr && moveResolverRef.current) {
            // Convert UCI string "e2e4" back to { from: 'e2', to: 'e4' }
            const from = moveStr.substring(0, 2);
            const to = moveStr.substring(2, 4);
            
            // Resolve the Promise!
            moveResolverRef.current({ from, to });
            
            // Clear the resolver so it's ready for the next turn
            moveResolverRef.current = null;
          }
        }
      };
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Expose the Promise-based function your page.tsx expects
  const getBestMove = useCallback((gameState: any, skillLevel: number): Promise<{ from: string, to: string }> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !isReady) {
        reject(new Error("Stockfish is not ready yet"));
        return;
      }

      // Store the resolve function so the onmessage listener can call it later
      moveResolverRef.current = resolve;

      // 1. Set the difficulty (Stockfish Skill Level goes from 0 to 20)
      workerRef.current.postMessage(`setoption name Skill Level value ${skillLevel}`);

      // 2. Feed the current board state to the bot. 
      // If your GameState has a FEN string property, use it. 
      // Otherwise, fallback to feeding it the move history from the starting position.
      if (gameState.fen) {
        workerRef.current.postMessage(`position fen ${gameState.fen}`);
      } else if (gameState.moveHistory && gameState.moveHistory.length > 0) {
        // Map GameExplorer moves to UCI format (e.g., e2e4)
        const uciMoves = gameState.moveHistory.map((m: any) => `${m.from}${m.to}`).join(' ');
        workerRef.current.postMessage(`position startpos moves ${uciMoves}`);
      } else {
        // If no FEN and no move history, it must be the start of the game
        workerRef.current.postMessage(`position startpos`);
      }

      // 3. Tell the bot to start thinking!
      // A depth of 10-15 is usually instant in WASM. Higher depths take longer.
      workerRef.current.postMessage(`go depth 12`);
    });
  }, [isReady]);

  return { isReady, getBestMove };
}