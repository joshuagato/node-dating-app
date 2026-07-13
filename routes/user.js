const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { getProfile, setupProfile, } = require('../controllers/user');
const { validateName, validatePassword, validateConfirmPassword } = require('../validators');


router.get('/profile', IsAuthenticated, getProfile);

router.put('/profile', 
    validateName('first_name'), validateName('last_name'), 
    IsAuthenticated, setupProfile);

module.exports = { userRouter: router };