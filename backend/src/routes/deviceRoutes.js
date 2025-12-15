const express = require('express');
const router = express.Router();
const { receiveData } = require('../controllers/deviceController');

// Note: Device endpoints might not use the standard user auth token 
// because ESP32 might not be able to handle login flows easily.
// For now, we leave it open or we could add a simple API key middleware.
router.post('/data', receiveData);

module.exports = router;
