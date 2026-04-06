// Server-side Stockfish endpoint (for future use)

import { Router } from 'express';
import { spawn } from 'child_process';
import { z } from 'zod';

const router: Router = Router();

// Validation schema
const BotMoveSchema = z.object({
  gameState: z.object({
    moveHistory: z.array(z.object({
      from: z.string(),
      to: z.string(),
    })),
    currentTurn: z.enum(['white', 'black']),
  }),
  skillLevel: z.number().min(0).max(20),
});

/**
 * POST /api/bot/move
 * Calculate best move using server-side Stockfish
 * 
 * This runs native Stockfish binary (much faster than WASM)
 * Use for Hard mode to ensure authenticity and prevent cheating
 */
router.post('/move', async (req, res) => {
  try {
    const { gameState, skillLevel } = BotMoveSchema.parse(req.body);

    // Spawn Stockfish process
    // You'll need to install Stockfish binary on your server:
    // Ubuntu: sudo apt-get install stockfish
    // Mac: brew install stockfish
    // Docker: FROM ubuntu:22.04 && apt-get install stockfish
    const stockfish = spawn('stockfish');

    let bestMove: string | null = null;

    stockfish.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Look for bestmove response
      if (output.includes('bestmove')) {
        const match = output.match(/bestmove ([a-h][1-8][a-h][1-8])/);
        if (match) {
          bestMove = match[1];
        }
      }
    });

    // Send UCI commands
    stockfish.stdin.write('uci\n');
    stockfish.stdin.write('isready\n');
    
    // Set skill level
    stockfish.stdin.write(`setoption name Skill Level value ${skillLevel}\n`);
    
    // Set position
    const moves = gameState.moveHistory.map(m => `${m.from}${m.to}`).join(' ');
    const positionCmd = moves 
      ? `position startpos moves ${moves}\n`
      : 'position startpos\n';
    stockfish.stdin.write(positionCmd);
    
    // Calculate (depth based on skill level)
    const depth = skillLevel < 5 ? 5 : skillLevel < 15 ? 10 : 15;
    stockfish.stdin.write(`go depth ${depth}\n`);

    // Wait for response (with timeout)
    const timeout = setTimeout(() => {
      stockfish.kill();
      res.status(504).json({ error: 'Calculation timeout' });
    }, 10000);

    stockfish.on('exit', () => {
      clearTimeout(timeout);
      
      if (bestMove) {
        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        
        res.json({
          move: { from, to },
          skillLevel,
          calculatedBy: 'server',
        });
      } else {
        res.status(500).json({ error: 'No move calculated' });
      }
    });

  } catch (error) {
    console.error('Bot move error:', error);
    res.status(400).json({ 
      error: error instanceof Error ? error.message : 'Invalid request' 
    });
  }
});

export default router;