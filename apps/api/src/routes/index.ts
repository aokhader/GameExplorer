import { Router, type Router as ExpressRouter } from 'express';
import authRoutes   from './auth.routes';
import gameRoutes   from './game.routes';
import userRoutes   from './user.routes';

const router: ExpressRouter = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth',  authRoutes);
router.use('/games', gameRoutes);
router.use('/users', userRoutes);

export default router;