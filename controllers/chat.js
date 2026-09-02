const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');
const { Sequelize, Op, where } = require('sequelize');

const { generateEmailVerificationCode, generatePasswordResetVerificationCode, generateTokenForUserId,
    generateCookiesForToken, generateCookiesForCurrentUserId, organizeErrors, deleteUserFields,
    checkForVerificationCodeExpiry, checkForChangedPasswordInThePast, setUserEmailVerificationRequest,
    setUserPasswordResetRequest, calculateAge
} = require('../utils/functions');
const { TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW, CHAT_STARTER } = require('../utils/constants');
const { onlineUsers } = require('../sockets/chatSocket');

const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserPicture = require('../models/UserPicture');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const ChatParticipant = require('../models/ChatParticipant');

// User -> Chat Associations
Chat.belongsTo(User, { as: 'chat_initiator', foreignKey: 'initiator_id' });
Chat.belongsTo(User, { as: 'chat_seconder', foreignKey: 'seconder_id' });
Chat.belongsTo(Message, { as: 'last_message', foreignKey: 'last_message_id' });
// Chat.belongsTo(User, { as: 'chat_other', foreignKey: 'initiator_id' });

Message.belongsTo(Chat, { foreignKey: 'chat_id', as: 'Chat' });
Chat.hasMany(Message, { foreignKey: 'chat_id', as: 'Messages' });

exports.sendMessage = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    // const { message: content, sender_id, recipient_id } = matchedData(req);
    const { message: content, sender_id, recipient_id } = req.body;

    // const user = req.user;
    // const { id: user_id } = user;


    const match = await Match.findOne({
        where:
        {
            initiator_id: { [Op.or]: [sender_id, recipient_id] },
            seconder_id: { [Op.or]: [sender_id, recipient_id] }
        }
    });

    const existingChat = await Chat.findOne({
        where: {
            initiator_id: { [Op.or]: [sender_id, recipient_id] },
            seconder_id: { [Op.or]: [sender_id, recipient_id] }
        }
    });

    let chat;
    if (!existingChat) {
        const starter_type = match ? CHAT_STARTER.MATCH : CHAT_STARTER.DIRECT;

        chat = await Chat.create({
            initiator_id: sender_id, seconder_id: recipient_id, starter_type
        });
    }

    const chat_id = existingChat ? existingChat.id : chat.id;
    // const match_id = match ? match.id : null;
    const sent_at = new Date();
    const delivered_at = onlineUsers.has(recipient_id) ? new Date() : null;

    // console.log({ chat_id, sender_id, recipient_id, content, sent_at, delivered_at });

    const message = await Message.create({
        chat_id, sender_id, recipient_id, content, sent_at, delivered_at
    });

    if (existingChat) {
        existingChat.last_message_id = message.id;
        existingChat.save();
    } else if (chat) {
        chat.last_message_id = message.id;
        chat.save();
    }

    // const message = { id: parseInt(messages_length) + 1, sender_id, recipient_id, sent_at, delivered_at, read_at: null, content };

    if (onlineUsers.has(recipient_id)) {
        const io = req.app.get('io');
        io.to(`user_${recipient_id}`).emit('new_message', { message });
    }

    const success = true;
    res.send({ success, message });
}

exports.getChats = async (req, res) => {
    const { id: user_id } = req.user;

    const unformattedChats = await Chat.findAll({
        where: {
            [Op.or]: [
                { initiator_id: user_id },
                { seconder_id: user_id }
            ]
        },
        attributes: [
            'id',
            'initiator_id',
            'seconder_id',
            'createdAt',
            'updatedAt',
            // Count unread messages where recipient_id === user_id
            [
                Sequelize.literal(`(
                    SELECT COUNT(*)::int
                    FROM "Messages" AS "unread"
                    WHERE "unread"."chat_id" = "Chat"."id"
                      AND "unread"."recipient_id" = '${user_id}'
                      AND "unread"."read_at" IS NULL
                )`),
                'unread_message_count'
            ]
        ],
        include: [
            {
                model: User,
                as: 'chat_initiator',
                attributes: ['id', 'first_name', 'last_name', 'other_names', 'date_of_birth', 'is_online', 'last_seen'],
                include: [
                    {
                        model: UserProfile,
                        as: 'profile',
                        attributes: ['first_name_on', 'last_name_on', 'other_names_on']
                    },
                    {
                        model: UserPicture,
                        as: 'pictures',
                        attributes: ['path', 'position'],
                        where: { position: 1 },
                        required: false,
                        limit: 1
                    }
                ]
            },
            {
                model: User,
                as: 'chat_seconder',
                attributes: ['id', 'first_name', 'last_name', 'other_names', 'date_of_birth', 'is_online', 'last_seen'],
                include: [
                    {
                        model: UserProfile,
                        as: 'profile',
                        attributes: ['first_name_on', 'last_name_on', 'other_names_on']
                    },
                    {
                        model: UserPicture,
                        as: 'pictures',
                        attributes: ['path', 'position'],
                        where: { position: 1 },
                        required: false,
                        limit: 1
                    }
                ]
            },
            {
                model: Message,
                as: 'last_message',
                attributes: ['id', 'sender_id', 'content', 'message_type', 'sent_at', 'delivered_at', 'read_at']
            }
        ],
        order: [['updatedAt', 'DESC']]
    });

    // Helper function to build dynamic name based on UserProfile settings
    const formatName = (user) => {
        if (!user) return '';
        const { first_name, last_name, other_names, profile } = user;

        let parts = [first_name || '']; // First name is defaulted true

        if (profile?.last_name_on && last_name) {
            parts.push(last_name);
        }
        if (profile?.other_names_on && other_names) {
            parts.push(other_names);
        }

        return parts.join(' ').trim() || 'Unknown User';
    };

    // Helper function to get picture (position 1)
    const getPicture = (user) => {
        if (!user || !user.pictures || user.pictures.length === 0) {
            return null;
        }
        return user.pictures[0]?.path || null;
    };

    // Helper to create user object with name and picture
    const createUserObject = (user) => {
        if (!user) {
            return {
                id: null,
                name: '',
                picture: null
            };
        }

        return {
            id: user.id,
            name: formatName(user),
            picture: getPicture(user)
        };
    };

    // Map results to format with myself and partner objects
    const chats = unformattedChats.map(chat => {
        const chatJson = chat.toJSON();

        // Determine which user is the current user and which is the partner
        const isInitiator = chatJson.initiator_id === user_id;
        const currentUser = isInitiator ? chatJson.chat_initiator : chatJson.chat_seconder;
        const partnerUser = isInitiator ? chatJson.chat_seconder : chatJson.chat_initiator;

        return {
            id: chatJson.id,
            // Partner information
            partner: {
                id: isInitiator ? chatJson.seconder_id : chatJson.initiator_id,
                name: formatName(partnerUser),
                picture: getPicture(partnerUser),
                is_online: partnerUser.is_online,
                last_seen: partnerUser.last_seen,
                age: calculateAge(partnerUser.date_of_birth)
            },
            // Current user information
            myself: {
                id: user_id,
                name: formatName(currentUser),
                picture: getPicture(currentUser)
            },
            unread_message_count: chatJson.unread_message_count || 0,
            last_message: chatJson.last_message ? {
                id: chatJson.last_message.id,
                sender_id: chatJson.last_message.sender_id,
                content: chatJson.last_message.content,
                message_type: chatJson.last_message.message_type,
                sent_at: chatJson.last_message.sent_at,
                delivered_at: chatJson.last_message.delivered_at,
                read_at: chatJson.last_message.read_at
            } : null,
            updatedAt: chatJson.updatedAt
        };
    });

    const success = true;
    res.send({ success, chats });
}

exports.getChatMessages = async (req, res) => {
    // const { id: user_id } = req.user;
    const { chat_id } = req.params;

    const messages = await Message.findAll({ where: { chat_id }, order: [['createdAt', 'ASC']] });

    const success = true;
    res.send({ success, messages });
}

exports.markMessageAsSeen = async (req, res) => {
    const { message_id: id } = req.params;
    let read_at = null;
    let success = false;

    // const [updatedRowsCount, updatedRows] = await Message.update({ read_at }, { where: { id } });
    const message = await Message.findOne({ where: { id, read_at } });
    if (!message) return res.send({ success });

    const { sender_id, recipient_id } = message;
    read_at = new Date();
    message.read_at = read_at;
    message.save();

    const io = req.app.get('io');
    if (onlineUsers.has(sender_id))
        io.to(`user_${sender_id}`).emit('message_read', { message });

    if (onlineUsers.has(recipient_id))
        io.to(`user_${recipient_id}`).emit('message_read', { recipient_id });

    success = true;
    res.send({ success });
}


exports.getNewChatsCount = async (req, res) => {
    const userId = req.user.id;

    const count = await Chat.count({
        distinct: true,
        col: 'id',
        include: [
            {
                model: Message,
                as: 'Messages',
                attributes: [],
                where: {
                    recipient_id: userId,
                    read_at: null,
                    // is_deleted: false,
                    // [Op.not]: Sequelize.literal(`:userId = ANY("Messages"."deleted_for")`)
                },
                required: true // INNER JOIN
            }
        ],
        replacements: { userId }
    });

    const success = true;
    res.send({ success, count });
}