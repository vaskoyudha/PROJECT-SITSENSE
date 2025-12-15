const express = require('express');
const router = express.Router();
const { register, login, getProfile, updateProfile } = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);

module.exports = router;
