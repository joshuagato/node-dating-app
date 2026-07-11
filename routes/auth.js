const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { login, signup, profile, verifyEmail, requestPasswordReset, confirmPasswordReset,
        resetPassword, 
    } = require('../controllers/user');
const { validateEmail, validatePassword, validateConfirmPassword } = require('../validators');

router.post('/login', validateEmail(), validatePassword(), login);

router.get('/profile', IsAuthenticated, profile);

router.post('/signup', validateEmail(), validatePassword(), validateConfirmPassword(), signup);

router.patch('/verify-email', IsAuthenticated, verifyEmail);

// router.patch('/request-password-reset', IsAuthenticated, validateEmail(), requestPasswordReset);
router.patch('/request-password-reset', validateEmail(), requestPasswordReset);

router.post('/confirm-password-reset', IsAuthenticated, confirmPasswordReset);

router.post('/reset-password', validatePassword(), validateConfirmPassword(), IsAuthenticated, resetPassword);

module.exports = { authRouter: router };