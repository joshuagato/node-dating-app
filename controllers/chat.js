const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');
const { Op } = require('sequelize');

const { generateEmailVerificationCode, generatePasswordResetVerificationCode, generateTokenForUserId,
    generateCookiesForToken, generateCookiesForCurrentUserId, organizeErrors, deleteUserFields,
    checkForVerificationCodeExpiry, checkForChangedPasswordInThePast, setUserEmailVerificationRequest,
    setUserPasswordResetRequest
} = require('../utils/functions');
const { TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW, CHAT_STARTER } = require('../utils/constants');
const { onlineUsers } = require('../sockets/chatSocket');

const Match = require('../models/Match');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const ChatParticipant = require('../models/ChatParticipant');

exports.sendMessage = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    // const { message: content, sender_id, recipient_id, messages_length } = matchedData(req);
    const { message: content, sender_id, recipient_id, messages_length } = req.body;

    // const user = req.user;
    // const { id: user_id } = user;


    const match = await Match.findOne({
        where:
        {
            initiator_id: { [Op.or]: [sender_id, recipient_id] },
            seconder_id: { [Op.or]: [sender_id, recipient_id] }
        }
    });
    console.log({ match });

    const existingChat = await Chat.findOne({
        where: {
            initiator_id: { [Op.or]: [sender_id, recipient_id] },
            seconder_id: { [Op.or]: [sender_id, recipient_id] }
        }
    });
    console.log({ existingChat });

    let chat;
    if (!existingChat) {
        const starter_type = match ? CHAT_STARTER.MATCH : CHAT_STARTER.DIRECT;

        chat = await Chat.create({
            initiator_id: sender_id, seconder_id: recipient_id, starter_type
        });

        console.log({ chat });
    }

    const chat_id = existingChat ? existingChat.id : chat.id;
    const match_id = match ? match.id : null;
    const sent_at = new Date();
    const delivered_at = onlineUsers.has(recipient_id) ? new Date() : null;

    const message = await Message.create({
        match_id, chat_id, sender_id, recipient_id, content, sent_at, delivered_at
    });

    if (existingChat) {
        existingChat.last_message_id = message.id;
        existingChat.save();
    } else if (chat) {
        chat.last_message_id = message.id;
        chat.save();
    }

    console.log({ message })

    // const message = { id: parseInt(messages_length) + 1, sender_id, recipient_id, sent_at, delivered_at, read_at: null, content };

    const io = req.app.get('io');

    io.to(`user_${recipient_id}`).emit('new_message', { message });

    const success = true;
    res.status(200).json({ success, message });
}
