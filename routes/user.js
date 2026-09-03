const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const {
    getProfile, setupBasicProfile, setupAdvancedProfile, getPotentialMatchProfiles,
    setupFinalProfile, getEncountersProfiles, getVerificationSelfie
} = require('../controllers/user');
const {
    validateName, validatePassword, validateConfirmPassword, validateLocation,
    validateCoordinates, validateSelfie
} = require('../validators');
const { upload } = require('../utils/utils');


router.get('/profile', IsAuthenticated, getProfile);

router.put('/basic-profile',
    validateName('first_name'), validateName('last_name'),
    IsAuthenticated, setupBasicProfile);

router.put('/advanced-profile', IsAuthenticated,
    validateLocation('country'), validateLocation('city'),
    validateCoordinates('longitude'), validateCoordinates('latitude'), validateSelfie(),
    setupAdvancedProfile);

router.get('/verification-selfie', IsAuthenticated, getVerificationSelfie);

router.put('/final-profile', IsAuthenticated, upload.array('images'), setupFinalProfile);

router.get('/get-encounters-profiles', IsAuthenticated, getEncountersProfiles);

router.get('/get-potential-match-profiles', IsAuthenticated, getPotentialMatchProfiles);

module.exports = { userRouter: router };