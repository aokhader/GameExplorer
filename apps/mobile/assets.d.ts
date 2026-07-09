// Type declarations for static image asset imports (e.g. the chess piece SVGs
// in packages/ui/src/chess/ChessPiece.tsx). packages/ui is consumed from source,
// and its own `src/assets.d.ts` is scoped to that package's tsconfig — it is NOT
// visible to this app's `tsc`, so the declaration is mirrored here (the web app
// does the same in apps/web/src/types/svg.d.ts). Metro resolves these at runtime.
declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}
