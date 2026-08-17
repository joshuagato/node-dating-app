const onlineUsers = new Map();

exports.initChatSocket = function (io) {
    io.on('connection', (socket) => {
        const userId = socket.handshake.query.userId;
        // console.log({ userId })

        if (userId) {
            onlineUsers.set(userId, socket.id);
            socket.join(`user_${userId}`);
            console.log(`user_${userId}`);
            // Broadcast online status to active peers
            io.emit('user_status_change', { userId, isOnline: true });
        }

        socket.on('new_message', ({ message }) => {
            console.log('message from new_message: ', message);
        });

        socket.on('send_message', ({ message }) => {
            console.log('message from send_message: ', message);
        });

        socket.on('sender_typing_start', ({ recipient_id }) => {
            io.to(`user_${recipient_id}`).emit('partner_typing', { recipient_id, isTyping: true });
        });

        socket.on('sender_typing_stop', ({ recipient_id }) => {
            io.to(`user_${recipient_id}`).emit('partner_typing', { recipient_id, isTyping: false });
        });

        socket.on('show_sender_message_read', ({ sender_id, new_array }) => {
            io.to(`user_${sender_id}`).emit('message_read', { sender_id, new_array });
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
            if (userId) {
                onlineUsers.delete(userId);
                io.emit('user_status_change', { userId, isOnline: false });
            }
        });
    });
};

exports.onlineUsers = onlineUsers;