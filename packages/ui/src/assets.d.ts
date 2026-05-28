// Tell TypeScript the shape of image module imports.
// Turbopack (web) and Metro (React Native) both resolve these to a URL or
// require() result at runtime; the exact type depends on the bundler.
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
