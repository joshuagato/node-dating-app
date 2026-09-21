// jobs/expireSubscriptions.js
const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

/**
 * Runs every 10 minutes.
 * 1. Deactivates Subscriptions whose expires_at has passed.
 * 2. Flips User.is_premium to false for anyone whose premium_expires_at has passed.
 *
 * Idempotent: safe to run on multiple instances, safe to run repeatedly.
 */
async function expireSubscriptions() {
    const now = new Date();

    try {
        // --- 1. Mark expired Subscription rows as expired ---
        const [expiredSubCount] = await Subscription.update(
            { status: 'expired' },
            {
                where: {
                    status: 'active',
                    expires_at: { [Op.lte]: now },
                },
            }
        );

        // --- 2. Revoke entitlement on User for anyone past their expiry ---
        const [expiredUserCount] = await User.update(
            { is_premium: false },
            {
                where: {
                    is_premium: true,
                    premium_expires_at: { [Op.lte]: now, [Op.ne]: null },
                },
            }
        );

        if (expiredSubCount > 0 || expiredUserCount > 0) {
            console.log(
                `[expireSubscriptions] ${expiredSubCount} subscription(s) marked expired, ` +
                `${expiredUserCount} user(s) downgraded at ${now.toISOString()}`
            );
        }
    } catch (error) {
        console.error('[expireSubscriptions] Job failed:', error);
    }
}

function startExpireSubscriptionsJob() {
    // Cron expression: every 10 minutes.
    // Runs at :00, :10, :20, :30, :40, :50 of every hour.
    const task = cron.schedule('*/10 * * * *', expireSubscriptions, {
        scheduled: true,
        timezone: 'UTC', // pin to UTC so it's deterministic across hosts
    });

    console.log('[expireSubscriptions] Scheduled to run every 10 minutes');
    return task;
}

module.exports = { startExpireSubscriptionsJob, expireSubscriptions };