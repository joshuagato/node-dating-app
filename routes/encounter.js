const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { likeUser, dislikeUser, getUsersWhoLikeMe, getUsersWhoDisLikeMe,
    getUsersDisLikedByMe, getNewLikesCount, getEncountersProfiles,
    markLikesAsSeen, saveEncountersFilter
} = require('../controllers/encounter');
const { validateName, validatePassword, validateConfirmPassword, validateLocation,
    validateCoordinates
} = require('../validators');


router.get('/get-encounters-profiles', IsAuthenticated, getEncountersProfiles);

router.put('/filter', IsAuthenticated, saveEncountersFilter);

router.post('/like-user', IsAuthenticated, likeUser);

router.post('/dislike-user', IsAuthenticated, dislikeUser);

router.post('/mark-likes-seen', IsAuthenticated, markLikesAsSeen);

router.get('/users-who-like-me', IsAuthenticated, getUsersWhoLikeMe);

router.get('/users-who-dislike-me', IsAuthenticated, getUsersWhoDisLikeMe);

router.get('/users-disliked-by-me', IsAuthenticated, getUsersDisLikedByMe);

router.get('/get-new-likes-count', IsAuthenticated, getNewLikesCount);


module.exports = { encounterRouter: router };