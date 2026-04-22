import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All routes require admin/super_admin
router.use(authenticate);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);
router.get('/analytics', adminController.getAnalytics);

// Users management
router.get('/users', adminController.getUsers);
router.put('/users/:id', adminController.updateUser);

// Workers management
router.get('/workers', adminController.getWorkers);
router.post('/workers', adminController.createWorker);
router.put('/workers/:id', adminController.updateWorker);
router.delete('/workers/:id', adminController.deleteWorker);

export default router;
