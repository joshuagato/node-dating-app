const express = require('express');
const router = express.Router();

const { authRouter } = require('../routes/auth');
const { userRouter } = require('../routes/user');
const { encounterRouter } = require('../routes/encounter');

router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/encounter', encounterRouter);

exports.apiRouter = router;