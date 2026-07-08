const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { login, signup, profile, verifyEmail } = require('../controllers/user');
const { validateEmail, validatePassword, validateConfirmPassword } = require('../validators');

router.post('/login', validateEmail(), validatePassword(), login);

router.get('/profile', IsAuthenticated, profile);

router.post('/signup', validateEmail(), validatePassword(), validateConfirmPassword(), signup);

router.post('/verify-email', IsAuthenticated, verifyEmail);

module.exports = { authRouter: router };