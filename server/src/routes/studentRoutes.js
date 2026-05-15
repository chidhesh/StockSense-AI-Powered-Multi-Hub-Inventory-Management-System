import express from 'express';
import { 
  register, login, getDashboard, 
  sendOTP, resetPassword, recommend, getVendors, getInventory, getHistory
} from '../controllers/studentController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/dashboard/:roll_no', getDashboard);
router.get('/inventory/:center_id', getInventory);
router.get('/history/:roll_no', getHistory);
router.post('/send-otp', sendOTP);
router.post('/reset-password', resetPassword);
router.post('/recommend', recommend);
router.get('/vendors/:component', getVendors);

export default router;
