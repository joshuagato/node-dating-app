const express = require('express');
const router = express.Router();

const { authRouter } = require('./auth');
const { userRouter } = require('./user');
const { encounterRouter } = require('./encounter');
const { chatRouter } = require('./chat');
const { premiumRouter } = require('./premium');
const { feedbackRouter } = require('./feedback');

router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/encounter', encounterRouter);
router.use('/chat', chatRouter);
router.use('/premium', premiumRouter);
router.use('/feedback', feedbackRouter);

exports.apiRouter = router;