const express = require('express');
const router = express.Router();
const { IsAuthenticated } = require('../middlewares/isAuthenticated');
const notificationController = require('../controllers/notification');

router.post('/register-token', IsAuthenticated, notificationController.registerDeviceToken);
router.get('/', IsAuthenticated, notificationController.getUserNotifications);
router.patch('/:notificationId/read', IsAuthenticated, notificationController.markAsRead);

module.exports = { notificationRouter: router };