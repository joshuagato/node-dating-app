const admin = require('../config/firebase');

const Notification = require('../models/Notification');
const UserDeviceToken = require('../models/UserDeviceToken');

/**
 * Dispatches notification across DB, Socket.io (if online), and FCM Push (if background/offline)
 */
exports.sendNotification = async ({ recipientId, actorId, type, title, body, metadata = {}, app }) => {
    try {
        // 1. Save Notification to Database
        const notification = await Notification.create({
            user_id: recipientId,
            actor_id: actorId,
            type,
            title,
            body,
            data: metadata,
            is_read: false
        });

        // 2. Real-Time Socket.io Dispatch
        // const io = app.get('io');
        // const activeUserSockets = app.get('activeUserSockets'); // Map of userId -> socketId
        // const recipientSocketId = activeUserSockets?.get(recipientId);

        // if (recipientSocketId && io) {
        //     io.to(recipientSocketId).emit('new_notification', notification);
        // }

        // 3. FCM Push Delivery for Web & Mobile App
        const userTokens = await UserDeviceToken.findAll({ where: { user_id: recipientId } });
        if (!userTokens || userTokens.length === 0) return notification;

        const tokens = userTokens.map(t => t.token);

        const pushPayload = {
            tokens,
            notification: { title, body },
            data: {
                notificationId: notification.id.toString(),
                type,
                click_action: metadata.url || '/notifications',
                ...metadata
            },
            webpush: {
                fcmOptions: { link: metadata.url || '/notifications' },
                notification: { icon: '/icon-192.png', badge: '/badge.png' }
            },
            android: {
                priority: 'high',
                notification: { sound: 'default', channelId: 'default' }
            },
            apns: {
                payload: { aps: { sound: 'default' } }
            }
        };

        const response = await admin.messaging().sendEachForMulticast(pushPayload);

        // Remove expired/uninstalled FCM tokens
        const invalidTokens = [];
        response.responses.forEach((res, idx) => {
            if (!res.success && res.error.code === 'messaging/invalid-registration-token') {
                invalidTokens.push(tokens[idx]);
            }
        });

        if (invalidTokens.length > 0) {
            await UserDeviceToken.destroy({ where: { token: invalidTokens } });
        }

        return notification;
    } catch (error) {
        console.error('Error delivering notification:', error);
    }
};