const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { likeUser, dislikeUser, getUserLikes } = require('../controllers/encounter');
const { validateName, validatePassword, validateConfirmPassword, validateLocation,
    validateCoordinates
} = require('../validators');


router.post('/like-user', IsAuthenticated, likeUser);

router.post('/dislike-user', IsAuthenticated, dislikeUser);

router.get('/user-likes', IsAuthenticated, getUserLikes);


module.exports = { encounterRouter: router };