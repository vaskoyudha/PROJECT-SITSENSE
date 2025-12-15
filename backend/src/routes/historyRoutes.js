const express = require('express');
const router = express.Router();
const { getSessions, getSessionById, createSession } = require('../controllers/historyController');
const authenticateToken = require('../middleware/authMiddleware');

router.use(authenticateToken); // All history routes require auth

router.get('/', getSessions);
router.get('/:id', getSessionById);
router.post('/', createSession);

module.exports = router;
