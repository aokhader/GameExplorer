// To allow for importing the Stockfish engine as a module in TypeScript, we declare a module for 'stockfish' and
// define the types for the Stockfish engine interface. This allows us to use the Stockfish engine in our 
// TypeScript code with proper type checking and IntelliSense support.
declare module 'stockfish' {
  interface StockfishEngine {
    postMessage(command: string): void;
    onmessage: ((event: any) => void) | null;
    terminate?: () => void;
  }

  function Stockfish(): StockfishEngine;
  
  export default Stockfish;
}