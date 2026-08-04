const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { getProfile, setupBasicProfile, setupAdvancedProfile, getPotentialMatchProfiles } = require('../controllers/user');
const { validateName, validatePassword, validateConfirmPassword } = require('../validators');
const { upload } = require('../utils/utils');


router.get('/profile', IsAuthenticated, getProfile);

router.put('/basic-profile',
    validateName('first_name'), validateName('last_name'),
    IsAuthenticated, setupBasicProfile);

router.put('/advanced-profile', IsAuthenticated, upload.array('images'), setupAdvancedProfile);

router.get('/get-potential-match-profiles', IsAuthenticated, getPotentialMatchProfiles);

module.exports = { userRouter: router };