const express = require('express');
const router = express.Router();

const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const { sendMessage, getChats, getChatMessages, markMessageAsSeen, getNewChatsCount } = require('../controllers/chat');
const { validateChatMessage } = require('../validators');

router.post('/send-message', validateChatMessage(), IsAuthenticated, sendMessage);

router.get('/get-chats', IsAuthenticated, getChats);

router.get('/get-chat-messages/:chat_id', IsAuthenticated, getChatMessages);

router.patch('/mark-message-as-read/:message_id', IsAuthenticated, markMessageAsSeen);

router.get('/get-new-chats-count', IsAuthenticated, getNewChatsCount);

module.exports = { chatRouter: router };