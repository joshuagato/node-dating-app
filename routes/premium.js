const express = require('express');
const router = express.Router();
const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const {
    getPrices, verifyPaystackPayment, paystackWebhook,
} = require('../controllers/premium');

router.get('/prices', IsAuthenticated, getPrices);
router.post('/paystack/verify', IsAuthenticated, verifyPaystackPayment);
router.post('/paystack/webhook', paystackWebhook)

module.exports = { premiumRouter: router };