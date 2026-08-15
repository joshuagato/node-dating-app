const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');
const { literal, Op } = require('sequelize');

const { generateEmailVerificationCode, generatePasswordResetVerificationCode, generateTokenForUserId,
    generateCookiesForToken, generateCookiesForCurrentUserId, organizeErrors, deleteUserFields,
    checkForVerificationCodeExpiry, checkForChangedPasswordInThePast, setUserEmailVerificationRequest,
    setUserPasswordResetRequest
} = require('../utils/functions');
const { TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW } = require('../utils/constants');

const Message = require('../models/Message');

exports.sendMessage = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    // const { message: content, sender_id, recipient_id, messages_length } = matchedData(req);
    const { message: content, sender_id, recipient_id, messages_length } = req.body;
    const user = req.user;

    const { id: user_id } = user;
    console.log({ sender_id, recipient_id, messages_length })

    // const newMessage = await Message.create({ ... });
    const message = { id: parseInt(messages_length) + 1, sender_id, recipient_id, sent: true, isDelivered: false, deliveredAt: '15-08-2026', seen: false, seenAt: null, content };

    const io = req.app.get('io');

    // io.to(`conv_${conversationId}`).emit('new_message', newMessage);
    io.emit('new_message', { message });
    console.log({ message })

    const success = true;
    res.status(200).json({ success, message });
}
