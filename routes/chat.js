const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { sendMessage, getChats } = require('../controllers/chat');
const { validateChatMessage } = require('../validators');

router.post('/send-message', validateChatMessage(), IsAuthenticated, sendMessage);

router.get('/get-chats', IsAuthenticated, getChats);

module.exports = { chatRouter: router };