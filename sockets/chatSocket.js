const Message = require('../models/Message');
const User = require('../models/User');

// Store Set of socket IDs per user to handle multiple tabs/connections gracefully
// Map<userId, Set<socketId>>
const onlineUsers = new Map();

const markMessageAsDelivered = async (recipient_id, io) => {
    if (!recipient_id) return;

    const delivered_at = new Date();

    // Find unread messages to notify senders
    const unreadMessages = await Message.findAll({
        where: { recipient_id, delivered_at: null },
        attributes: ['id', 'sender_id', 'recipient_id', 'content', 'createdAt']
    });

    if (unreadMessages.length === 0) return;

    // Bulk update in DB directly
    await Message.update(
        { delivered_at },
        { where: { recipient_id, delivered_at: null } }
    );

    // Notify online senders
    unreadMessages.forEach(message => {
        const { sender_id } = message;
        if (onlineUsers.has(sender_id.toString())) {
            io.to(`user_${sender_id}`).emit('message_delivered', { message });
        }
    });
};

const changeUserOnlineStatus = async (user_id, is_online, io) => {
    let last_seen = is_online ? null : new Date();

    io.emit('user_status_change', { user_id, is_online, last_seen });

    await User.update(
        { is_online, last_seen },
        { where: { id: user_id } }
    );
};

exports.initChatSocket = function (io) {
    io.on('connection', async (socket) => {
        const userId = socket.handshake.query.userId;

        if (!userId || userId === 'null' || userId === 'undefined') {
            return socket.disconnect(true);
        }

        const stringUserId = userId.toString();

        // 1. Manage Active Sockets per User
        if (!onlineUsers.has(stringUserId)) {
            onlineUsers.set(stringUserId, new Set());
        }

        const userSockets = onlineUsers.get(stringUserId);
        const wasOffline = userSockets.size === 0;

        userSockets.add(socket.id);
        socket.join(`user_${stringUserId}`);

        // Only trigger DB update on FIRST active connection
        if (wasOffline) {
            await changeUserOnlineStatus(stringUserId, true, io);
        }

        // Process undelivered messages upon connecting
        await markMessageAsDelivered(stringUserId, io);

        // --- Event Listeners ---
        socket.on('sender_typing_start', ({ recipient_id, sender_id }) => {
            io.to(`user_${recipient_id}`).emit('partner_typing', { recipient_id, sender_id, isTyping: true });
        });

        socket.on('sender_typing_stop', ({ recipient_id, sender_id }) => {
            io.to(`user_${recipient_id}`).emit('partner_typing', { recipient_id, sender_id, isTyping: false });
        });

        socket.on('join_conversation', ({ conversationId }) => {
            socket.join(`conv_${conversationId}`);
        });

        socket.on('check_online_status', ({ partnerId }, callback) => {
            const isOnline = onlineUsers.has(partnerId?.toString()) && onlineUsers.get(partnerId.toString()).size > 0;
            if (typeof callback === 'function') {
                callback({ partnerId, isOnline });
            }
        });

        // Handle Disconnects
        socket.on('disconnect', async () => {
            const activeSockets = onlineUsers.get(stringUserId);

            if (activeSockets) {
                activeSockets.delete(socket.id);

                // Only set offline when ALL tabs/connections are closed
                if (activeSockets.size === 0) {
                    onlineUsers.delete(stringUserId);
                    await changeUserOnlineStatus(stringUserId, false, io);
                }
            }
        });
    });
};

exports.onlineUsers = onlineUsers;