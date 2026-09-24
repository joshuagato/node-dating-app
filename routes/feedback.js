// routes/feedback.js
const express = require('express');
const router = express.Router();

const { getMyFeedback, submitFeedback } = require('../controllers/feedback');
const { IsAuthenticated } = require('../middlewares/isAuthenticated');

router.post('/send', IsAuthenticated, submitFeedback);
router.get('/get', IsAuthenticated, getMyFeedback);

module.exports = { feedbackRouter: router };