const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { login, signup, profile, verifyEmail, requestPasswordReset, confirmPasswordReset,
        resetPassword, 
    } = require('../controllers/auth');
const { validateEmail, validatePassword, validateConfirmPassword, validateCode } = require('../validators');

router.post('/login', validateEmail(), validatePassword(), login);

router.post('/signup', validateEmail(), validatePassword(), validateConfirmPassword(), signup);

router.patch('/verify-email', validateCode('verification_code', 4), IsAuthenticated, verifyEmail);

// router.patch('/request-password-reset', IsAuthenticated, validateEmail(), requestPasswordReset);
router.patch('/request-password-reset', validateEmail(), requestPasswordReset);

router.post('/confirm-password-reset', validateCode('verification_code', 6), IsAuthenticated, confirmPasswordReset);

router.post('/reset-password', validatePassword(), validateConfirmPassword(), IsAuthenticated, resetPassword);

module.exports = { authRouter: router };