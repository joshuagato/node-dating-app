const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { getProfile, setupBasicProfile, } = require('../controllers/user');
const { validateName, validatePassword, validateConfirmPassword } = require('../validators');


router.get('/profile', IsAuthenticated, getProfile);

router.put('/basic-profile', 
    validateName('first_name'), validateName('last_name'), 
    IsAuthenticated, setupBasicProfile);

module.exports = { userRouter: router };