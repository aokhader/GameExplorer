// Route aggregator for the API server
import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';

const router: ExpressRouter = Router();

// TODO: Add route modules here
// router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
// router.use('/games', gameRoutes);

// Health check route
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;