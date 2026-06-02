// To allow for importing the Stockfish engine, we declare a module for 'stockfish' and define the types 
// for the Stockfish engine interface. 
declare module 'stockfish' {
  interface StockfishEngine {
    postMessage(command: string): void;
    onmessage: ((event: MessageEvent) => void) | null;
    terminate?: () => void;
  }

  function Stockfish(): StockfishEngine;
  
  export default Stockfish;
}