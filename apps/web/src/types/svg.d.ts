// Type declarations for static SVG asset imports processed by Next.js / Turbopack.
//
// next-env.d.ts (gitignored) normally provides these via:
//   /// <reference types="next/image-types/global" />
// Adding them here ensures `tsc --noEmit` in CI always has them available.
//
// At runtime Next.js/Turbopack returns a StaticImageData object { src, height, width }.
// ChessPiece.tsx handles both string and StaticImageData via its `typeof raw === 'string'`
// guard, so the `string` type here is intentionally simplified.
declare module '*.svg' {
  const src: string;
  export default src;
}
