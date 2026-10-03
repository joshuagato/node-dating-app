const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '../database/serviceAccountKey.json');

try {
    initializeApp({
        credential: cert(require(serviceAccountPath))
    });
    console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error.message);
    throw error;
}

module.exports = {
    messaging: () => getMessaging()
};
