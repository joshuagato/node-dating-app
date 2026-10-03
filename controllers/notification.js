const Notification = require('../models/Notification');
const UserDeviceToken = require('../models/UserDeviceToken');

// Save or Update FCM Token
exports.registerDeviceToken = async (req, res) => {
    try {
        const { id: user_id } = req.user;
        const { token, platform } = req.body;

        if (!token || !platform) {
            return res.status(400).json({ success: false, message: 'Token and platform are required.' });
        }

        const [deviceToken] = await UserDeviceToken.findOrCreate({
            where: { user_id, token },
            defaults: { platform }
        });

        if (deviceToken.platform !== platform) {
            await deviceToken.update({ platform });
        }

        return res.status(200).json({ success: true, message: 'Device token stored successfully.' });
    } catch (error) {
        console.error('Error in registerDeviceToken:', error);
        return res.status(500).json({ success: false, message: 'Failed to register token.' });
    }
};

// Fetch User Notifications
exports.getUserNotifications = async (req, res) => {
    try {
        const { id: user_id } = req.user;
        const notifications = await Notification.findAll({
            where: { user_id },
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        return res.status(200).json({ success: true, notifications });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
    }
};

// Mark Single Notification as Read
exports.markAsRead = async (req, res) => {
    try {
        const { id: user_id } = req.user;
        const { notificationId } = req.params;

        await Notification.update(
            { is_read: true },
            { where: { id: notificationId, user_id } }
        );

        return res.status(200).json({ success: true, message: 'Notification marked as read.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating notification.' });
    }
};