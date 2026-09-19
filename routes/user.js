const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const {
    getProfile, setupBasicProfile, setupAdvancedProfile, getPotentialMatchProfiles,
    setupFinalProfile, getVerificationSelfie, updateProfile,
    getNearbyUsers, completeProfileSetup, getPartnerProfile
} = require('../controllers/user');
const {
    validateName, validatePassword, validateConfirmPassword, validateLocation,
    validateCoordinates, validateSelfie, profileSetupValidation
} = require('../validators');
const { upload } = require('../utils/utils');


router.get('/profile', IsAuthenticated, getProfile);

router.get('/partner-profile/:id', IsAuthenticated, getPartnerProfile);

router.put('/update-profile', IsAuthenticated, upload.any(), updateProfile);

router.put('/basic-profile',
    validateName('first_name'), validateName('last_name'),
    IsAuthenticated, setupBasicProfile);

router.put('/advanced-profile', IsAuthenticated,
    validateLocation('country'), validateLocation('city'),
    validateCoordinates('longitude'), validateCoordinates('latitude'), validateSelfie(),
    setupAdvancedProfile);

router.put('/complete-profile-setup', IsAuthenticated, profileSetupValidation, completeProfileSetup);

router.get('/verification-selfie', IsAuthenticated, getVerificationSelfie);

router.put('/final-profile', IsAuthenticated, upload.array('images'), setupFinalProfile);

router.get('/get-potential-match-profiles', IsAuthenticated, getPotentialMatchProfiles);

router.get('/get-nearby-users', IsAuthenticated, getNearbyUsers);

module.exports = { userRouter: router };