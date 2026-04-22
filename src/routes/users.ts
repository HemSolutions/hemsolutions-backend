import { Router } from 'express';
import * as userController from '../controllers/userController';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Profile
router.get('/profile', userController.getProfile);
router.put(
  '/profile',
  userController.updateProfileValidation,
  validateRequest,
  userController.updateProfile
);
router.put(
  '/change-password',
  userController.changePasswordValidation,
  validateRequest,
  userController.changePassword
);

// Addresses
router.get('/addresses', userController.getAddresses);
router.post(
  '/addresses',
  userController.createAddressValidation,
  validateRequest,
  userController.createAddress
);
router.put(
  '/addresses/:id',
  userController.createAddressValidation,
  validateRequest,
  userController.updateAddress
);
router.delete('/addresses/:id', userController.deleteAddress);

export default router;
