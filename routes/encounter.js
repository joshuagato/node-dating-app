const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { likeUser, dislikeUser, getUsersWhoLikeMe, getUsersWhoDisLikeMe, getUsersDisLikedByMe } = require('../controllers/encounter');
const { validateName, validatePassword, validateConfirmPassword, validateLocation,
    validateCoordinates
} = require('../validators');


router.post('/like-user', IsAuthenticated, likeUser);

router.post('/dislike-user', IsAuthenticated, dislikeUser);

router.get('/users-who-like-me', IsAuthenticated, getUsersWhoLikeMe);

router.get('/users-who-dislike-me', IsAuthenticated, getUsersWhoDisLikeMe);

router.get('/users-disliked-by-me', IsAuthenticated, getUsersDisLikedByMe);


module.exports = { encounterRouter: router };