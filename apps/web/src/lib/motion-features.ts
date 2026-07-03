// Framer Motion feature bundle for <LazyMotion>, isolated in its own module so
// it becomes a separate async chunk: pages ship only the tiny `m`/`LazyMotion`
// runtime up front and the animation engine streams in behind first paint.
// `domAnimation` covers everything we use (animate/exit/variants); switch to
// `domMax` only if layout animations or drag gestures are ever added.
import { domAnimation } from 'framer-motion';

export default domAnimation;
