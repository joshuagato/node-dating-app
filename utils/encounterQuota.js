const DailyEncounterView = require('../models/DailyEncounterView');
const {
    FREE_DAILY_ENCOUNTER_LIMIT,
    FREE_DAILY_WINDOW_MS,
} = require('../utils/constants');

/**
 * Load (and reset if the window expired) the quota record for a user.
 * Returns:
 *   {
 *     limit, seen, remaining, resetsAt, exhausted: boolean,
 *     record,        // the Sequelize instance (caller may save/increment)
 *     isPremium
 *   }
 * For premium users, returns { isPremium: true, exhausted: false, ... } without touching the DB.
 */
async function getQuota(user) {
    const isPremium = !!user.is_premium;

    if (isPremium) {
        return {
            isPremium: true,
            limit: null,
            seen: 0,
            remaining: Infinity,
            resetsAt: null,
            exhausted: false,
            record: null,
        };
    }

    const now = new Date();

    // findOrCreate handles the race where two concurrent requests both
    // try to create the row for the same user. The unique constraint on
    // user_id guarantees only one row exists; findOrCreate catches the
    // unique-violation from the loser and returns the winner's row.
    const [record] = await DailyEncounterView.findOrCreate({
        where: { user_id: user.id },
        defaults: {
            user_id: user.id,
            count: 0,
            window_started_at: now,
        },
    });

    // Check whether the 24-hour window has expired for this user. If so,
    // reset the counter and stamp a new window start. This is the "lazy
    // reset" — no cron needed, and only users who come back get reset.
    const windowAgeMs =
        now.getTime() - new Date(record.window_started_at).getTime();

    if (windowAgeMs >= FREE_DAILY_WINDOW_MS) {
        record.count = 0;
        record.window_started_at = now;
        await record.save();
    }

    const seen = record.count;
    const remaining = Math.max(0, FREE_DAILY_ENCOUNTER_LIMIT - seen);

    return {
        isPremium: false,
        limit: FREE_DAILY_ENCOUNTER_LIMIT,
        seen,
        remaining,
        resetsAt: new Date(
            new Date(record.window_started_at).getTime() +
            FREE_DAILY_WINDOW_MS
        ),
        exhausted: remaining === 0,
        record,
    };
}

/**
 * Increment quota for a free user. Safe to call for premium users (no-op).
 * Uses the instance passed in from getQuota so we don't re-query.
 */
async function incrementQuota(quota, by = 1) {
    if (quota.isPremium || by <= 0) return;

    await DailyEncounterView.increment(
        { count: by },
        { where: { user_id: quota.record.user_id } }
    );

    quota.seen += by;
    quota.remaining = Math.max(0, quota.limit - quota.seen);
    quota.exhausted = quota.remaining === 0;
}

module.exports = { getQuota, incrementQuota };