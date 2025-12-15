const express = require('express');
const router = express.Router();
const { getAdvice } = require('../controllers/aiController');
const authenticateToken = require('../middleware/authMiddleware');

// Protect AI endpoint with auth
router.post('/advice', authenticateToken, getAdvice);

module.exports = router;
