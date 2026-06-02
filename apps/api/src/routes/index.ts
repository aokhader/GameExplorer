import { Router, type Router as ExpressRouter } from 'express';
import gameRoutes   from './game.routes';
import userRoutes   from './user.routes';

const router: ExpressRouter = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/games', gameRoutes);
router.use('/users', userRoutes);

export default router;