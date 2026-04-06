import { useEffect, useRef, useState, useCallback } from 'react';

const DIFFICULTY_CONFIG = {
  easy: { skill: 1, elo: 1000 },  
  medium: { skill: 10, elo: 1600 },
  hard: { skill: 20, elo: 2500 }
};

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const moveResolverRef = useRef<((move: { from: string, to: string }) => void) | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      workerRef.current = new Worker('/stockfish/stockfish.js');
      workerRef.current.postMessage('uci');

      workerRef.current.onmessage = (e) => {
        const message = typeof e.data === 'string' ? e.data : e.data.data;
        
        if (message === 'uciok') {
          setIsReady(true);
          workerRef.current?.postMessage('isready');
        }

        // Log the engine's internal evaluation (Centipawns/Mate) and search depth
        if (typeof message === 'string' && message.startsWith('info depth')) {
          // Only log the final few depths to avoid spamming the console
          if (message.includes('depth 10') || message.includes('depth 12')) {
             console.log('Bot Thought Process:', message);
          }
        }
        // ==========================================

        if (typeof message === 'string' && message.startsWith('bestmove')) {
          const moveStr = message.split(' ')[1]; 
          
          if (moveStr && moveResolverRef.current) {
            const from = moveStr.substring(0, 2);
            const to = moveStr.substring(2, 4);
            
            moveResolverRef.current({ from, to });
            moveResolverRef.current = null;
          }
        }
      };
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Update this to accept the string difficulty rather than a raw number
  const getBestMove = useCallback((gameState: any, difficulty: 'easy' | 'medium' | 'hard'): Promise<{ from: string, to: string }> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current || !isReady) {
        reject(new Error("Stockfish is not ready yet"));
        return;
      }

      moveResolverRef.current = resolve;

      const config = DIFFICULTY_CONFIG[difficulty];
      
      console.log(`Configuring Bot for ${difficulty.toUpperCase()} mode (Target ELO: ${config.elo})`);

      // 1. Clear hash/memory between moves so it doesn't use grandmaster lines from previous hard games
      workerRef.current.postMessage('ucinewgame');

      // 2. Explicit ELO configuration (Modern approach)
      workerRef.current.postMessage('setoption name UCI_LimitStrength value true');
      workerRef.current.postMessage(`setoption name UCI_Elo value ${config.elo}`);
      
      // Fallback to legacy Skill Level just to be safe across WASM versions
      workerRef.current.postMessage(`setoption name Skill Level value ${config.skill}`);

      // 3. Feed board state
      if (gameState.fen) {
        workerRef.current.postMessage(`position fen ${gameState.fen}`);
      } else if (gameState.moveHistory && gameState.moveHistory.length > 0) {
        const uciMoves = gameState.moveHistory.map((m: any) => `${m.from}${m.to}`).join(' ');
        workerRef.current.postMessage(`position startpos moves ${uciMoves}`);
      } else {
        workerRef.current.postMessage(`position startpos`);
      }

      // 4. Force a time limit (e.g., 1000ms) rather than fixed depth. 
      // This makes "Easy" play fast and bad, and "Hard" use its full time to think.
      workerRef.current.postMessage(`go movetime 1000`);
    });
  }, [isReady]);

  return { isReady, getBestMove };
}