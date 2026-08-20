const Message = require('../models/Message');
const User = require('../models/User');
// const { markMessageAsDelivered } = require('../controllers/chat');

const onlineUsers = new Map();
let last_recipient_id = '';
let last_user_id = '';

const markMessageAsDelivered = async (recipient_id, io) => {
    if (!recipient_id) return;
    if (last_recipient_id.toString() === recipient_id.toString()) return;

    last_user_id = recipient_id;

    const delivered_at = null;
    const messages = await Message.findAll({ where: { recipient_id, delivered_at } });

    if (messages.length > 0) {
        messages.forEach(message => {
            message.delivered_at = new Date();
            message.save();
            const { sender_id } = message;

            if (onlineUsers.has(sender_id))
                io.to(`user_${sender_id}`).emit('message_delivered', { message });
        });
    }

    setTimeout(() => {
        last_recipient_id = '';
    }, 1000);
}

const changeUserOnlineStatus = async ({ user_id, is_online }, io) => {
    if (user_id === last_user_id) return;
    let last_seen = null;

    last_user_id = user_id;
    // Broadcast online status to active peers
    if (is_online) {
        io.emit('user_status_change', { user_id, is_online });
        await User.update({ is_online, last_seen }, { where: { id: user_id } });
    }
    else {
        if (!onlineUsers.has(user_id)) {
            last_seen = new Date();
            io.emit('user_status_change', { user_id, is_online, last_seen });
            await User.update({ is_online, last_seen }, { where: { id: user_id } });
        }
    }

    setTimeout(() => {
        last_user_id = '';
    }, 1000);
}

exports.initChatSocket = function (io) {
    io.on('connection', async (socket) => {
        const userId = socket.handshake.query.userId;
        const user_id = socket.handshake.query.userId;

        // if (userId) {
        if (userId && userId !== 'null' && userId !== 'undefined') {
            onlineUsers.set(userId, socket.id);
            socket.join(`user_${userId}`);

            await changeUserOnlineStatus({ user_id, is_online: true }, io);

            await markMessageAsDelivered(userId, io);
            console.log('Trig: ', { userId, user_id });
        }

        socket.on('new_message', ({ message }) => {
            console.log('message from new_message: ', message);
        });

        socket.on('send_message', ({ message }) => {
            console.log('message from send_message: ', message);
        });

        socket.on('sender_typing_start', ({ recipient_id, sender_id }) => {
            io.to(`user_${recipient_id}`).emit('partner_typing', { recipient_id, sender_id, isTyping: true });
        });

        socket.on('sender_typing_stop', ({ recipient_id, sender_id }) => {
            io.to(`user_${recipient_id}`).emit('partner_typing', { recipient_id, sender_id, isTyping: false });
        });

        // 1. Join Conversation Room
        socket.on('join_conversation', ({ conversationId }) => {
            // console.log({ conversationId })
            socket.join(`conv_${conversationId}`);
        });

        // 2. Real-Time Typing Indicators
        socket.on('typing_start', ({ conversationId, partnerId }) => {
            const partnerSocketId = onlineUsers.get(partnerId);
            if (partnerSocketId) {
                io.to(partnerSocketId).emit('partner_typing', { conversationId, isTyping: true });
            }
        });

        socket.on('typing_stop', ({ conversationId, partnerId }) => {
            const partnerSocketId = onlineUsers.get(partnerId);
            if (partnerSocketId) {
                io.to(partnerSocketId).emit('partner_typing', { conversationId, isTyping: false });
            }
        });

        // 3. WebRTC Audio/Video Signaling
        socket.on('call_user', ({ targetUserId, offer, signalType }) => {
            const targetSocketId = onlineUsers.get(targetUserId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('incoming_call', {
                    callerId: userId,
                    offer,
                    signalType // 'AUDIO' or 'VIDEO'
                });
            }
        });

        socket.on('answer_call', ({ targetUserId, answer }) => {
            const targetSocketId = onlineUsers.get(targetUserId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('call_accepted', { answer });
            }
        });

        socket.on('ice_candidate', ({ targetUserId, candidate }) => {
            const targetSocketId = onlineUsers.get(targetUserId);
            if (targetSocketId) {
                io.to(targetSocketId).emit('ice_candidate', { candidate });
            }
        });

        // 4. Online Presence Query
        socket.on('check_online_status', ({ partnerId }, callback) => {
            const isOnline = onlineUsers.has(partnerId);
            callback({ partnerId, isOnline });
        });

        socket.on('disconnect', () => {
            if (user_id && user_id !== 'null' && user_id !== 'undefined') {
                onlineUsers.delete(user_id);
                changeUserOnlineStatus({ user_id, is_online: false }, io);
            }
        });
    });
};

exports.onlineUsers = onlineUsers;