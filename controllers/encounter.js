const { validationResult, matchedData } = require('express-validator');
const { Sequelize, Op } = require('sequelize');
const moment = require('moment');

const { organizeErrors } = require('../utils/functions');
const { ENCOUNTER_ACTION, MATCH_STATUS, FREE_DAILY_ENCOUNTER_LIMIT, AD_EVERY_N_CARDS,
    FREE_DAILY_WINDOW_MS, CHAT_STARTER, GENDER } = require('../utils/constants');
const { getQuota, incrementQuota } = require('../utils/encounterQuota');

const Encounter = require('../models/Encounter');
const Match = require('../models/Match');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserPicture = require('../models/UserPicture');
const DailyEncounterView = require('../models/DailyEncounterView');
const Chat = require('../models/Chat');
const EncountersFilter = require('../models/EncountersFilter');

User.hasMany(Encounter, { foreignKey: 'initiator_id', as: 'initiatedEncounters' });
User.hasMany(Encounter, { foreignKey: 'recipient_id', as: 'receivedEncounters' });

Encounter.belongsTo(User, { foreignKey: 'initiator_id', as: 'initiator' });
Encounter.belongsTo(User, { foreignKey: 'recipient_id', as: 'recipient' });

User.hasOne(EncountersFilter, {
    foreignKey: 'user_id',
    as: 'encountersFilter',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
});

EncountersFilter.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
});

function formatMyself(me) {
    if (!me) return null;

    const plain = me.toJSON ? me.toJSON() : me;

    return {
        id: plain.id,
        name: plain.name,
        picture: plain.pictures?.[0]?.path || null,
        gender: plain.gender || null,
        city: plain.city || null,
        is_online: plain.is_online || false,
        last_seen: plain.last_seen || null,
        interested_in: plain.interested_in,
        date_of_birth: plain.date_of_birth,
        filter: plain.encountersFilter
            ? {
                max_distance_km: plain.encountersFilter.max_distance_km,
                interested_in: plain.encountersFilter.interested_in,
                min_age: plain.encountersFilter.min_age,
                max_age: plain.encountersFilter.max_age,
                online_only: plain.encountersFilter.online_only,
                premium_only: plain.encountersFilter.premium_only,
            }
            : null,
    };
}

exports.getEncountersProfiles = async (req, res) => {
    try {
        // ---- 0. Auth ----
        const currentUser = req.user;
        if (!currentUser) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { id: currentUserId } = currentUser;

        // ---- 1. Validate & normalise location ----
        const lat = Number(currentUser.latitude);
        const lng = Number(currentUser.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
                success: false,
                message: 'Your location is not set. Please update your profile location.',
            });
        }

        // ---- 2. Load (or lazily create) the user's filter row ----
        let filter = await EncountersFilter.findOne({
            where: { user_id: currentUserId },
        });

        if (!filter) {
            // Defensive: if an older account predates EncountersFilter,
            // create one on the fly using the same defaults.
            filter = await EncountersFilter.create({
                user_id: currentUserId,
                max_distance_km: 200,
                interested_in:
                    currentUser.interested_in || GENDER.EVERYONE,
                min_age: 18,
                max_age: 100,
                online_only: false,
                premium_only: false,
            });
        } else {
            const updates = {
                max_distance_km: Number(req.query.max_distance),
                interested_in: req.query.interested_in,
                min_age: Number(req.query.min_age),
                max_age: Number(req.query.max_age),
            };

            // online_only and premium_only are only sent when truthy
            // (the frontend omits them otherwise), so only override when present.
            if (req.query.online_only !== undefined) {
                updates.online_only = parseBool(req.query.online_only) ?? false;
            }
            if (req.query.premium_only !== undefined) {
                updates.premium_only = parseBool(req.query.premium_only) ?? false;
            }

            await filter.update(updates);
        }

        // ---- 3. Resolve effective filters ----
        // Query params (sent by the filter modal) override the stored row
        // for THIS request only. If nothing is passed, we use the stored
        // (or default) values.
        const maxDistanceKm = clamp(
            Number(req.query.max_distance) || filter.max_distance_km,
            1,
            500
        );

        const interestedIn = req.query.interested_in || filter.interested_in;

        const minAge = clamp(
            parseInt(req.query.min_age, 10) || filter.min_age,
            18,
            100
        );

        const maxAge = clamp(
            parseInt(req.query.max_age, 10) || filter.max_age,
            18,
            100
        );

        const onlineOnly =
            parseBool(req.query.online_only) ?? filter.online_only;
        const premiumOnly =
            parseBool(req.query.premium_only) ?? filter.premium_only;

        // ---- 4. Quota check (READ ONLY) ----
        const quota = await getQuota(currentUser);
        const currentUserIsPremium = quota.isPremium;

        const quotaPayload = quota.isPremium
            ? null
            : {
                limit: quota.limit,
                seen: quota.seen,
                remaining: quota.remaining,
                resetsAt: quota.resetsAt,
            };

        // ---- 5. "myself" — now includes premium + filter fields ----
        const myselfPromise = User.findByPk(currentUserId, {
            attributes: [
                'id',
                [
                    Sequelize.literal(`
                        CONCAT(
                            "User"."first_name",
                            CASE WHEN "profile"."last_name_on" = TRUE
                                 THEN CONCAT(' ', "User"."last_name") ELSE '' END,
                            CASE WHEN "profile"."other_names_on" = TRUE
                                 THEN CONCAT(' ', "User"."other_names") ELSE '' END
                        )
                    `),
                    'name',
                ],
                'gender',
                'city',
                'latitude',
                'longitude',
                'is_online',
                'last_seen',
                'date_of_birth',
                'interested_in',
            ],
            include: [
                { model: UserProfile, as: 'profile', attributes: [], required: false },
                {
                    model: UserPicture,
                    as: 'pictures',
                    attributes: ['path', 'position'],
                    required: false,
                    separate: true,
                    order: [['position', 'ASC']],
                },
                {
                    model: EncountersFilter,
                    as: 'encountersFilter',
                    required: false,
                },
            ],
        });

        // ---- 6. Short-circuit on quota exhaustion ----
        if (!quota.isPremium && quota.exhausted) {
            const me = await myselfPromise;
            return res.status(200).json({
                success: true,
                myself: formatMyself(me),
                filter: formatFilter(filter, false, false),
                users: [],
                quota: quotaPayload,
                quotaExhausted: true,
                adEveryN: AD_EVERY_N_CARDS,
                message: 'Daily encounter limit reached. Come back later.',
            });
        }

        // ---- 7. Cap the effective limit by remaining quota ----
        const requestedLimit = Math.max(
            1,
            Math.min(50, parseInt(req.query.limit, 10) || 20)
        );
        const requestedOffset = Math.max(
            0,
            parseInt(req.query.offset, 10) || 0
        );
        const effectiveLimit = quota.isPremium
            ? requestedLimit
            : Math.min(requestedLimit, quota.remaining);

        // ---- 8. Build WHERE conditions ----
        const distanceLiteral = Sequelize.literal(`
            ROUND(
                (
                    6371 * acos(
                        LEAST(1, GREATEST(-1,
                            cos(radians(:lat))
                            * cos(radians("User"."latitude"))
                            * cos(radians("User"."longitude") - radians(:lng))
                            + sin(radians(:lat))
                            * sin(radians("User"."latitude"))
                        ))
                    )
                )::numeric, 0
            )
        `);

        const ageLiteral = Sequelize.literal(`
            DATE_PART('year', AGE(CURRENT_DATE, "User"."date_of_birth"))::integer
        `);

        const andConditions = [
            Sequelize.literal(`
                (
                    6371 * acos(
                        LEAST(1, GREATEST(-1,
                            cos(radians(:lat))
                            * cos(radians("User"."latitude"))
                            * cos(radians("User"."longitude") - radians(:lng))
                            + sin(radians(:lat))
                            * sin(radians("User"."latitude"))
                        ))
                    )
                ) <= :maxDistance
            `),
            Sequelize.where(ageLiteral, { [Op.gte]: minAge }),
            Sequelize.where(ageLiteral, { [Op.lte]: maxAge }),
        ];

        // Gender filter — skip when the user selected EVERYONE.
        const genderClause = {};
        if (
            interestedIn &&
            interestedIn !== GENDER.EVERYONE &&
            interestedIn !== GENDER.EVERONE
        ) {
            // Map plural "men" → "man" etc., mirroring the nearby controller.
            genderClause.gender =
                interestedIn === GENDER.MEN ? GENDER.MAN : GENDER.WOMAN;
        }

        // Online-only and Premium-only are premium features. Ignore them entirely
        // for free users, even if they sneak the params into the query string.
        const onlineClause = {};
        const premiumClause = {};

        if (currentUserIsPremium) {
            if (onlineOnly) {
                onlineClause.is_online = true;
            }
            if (premiumOnly) {
                premiumClause.is_premium = true;
            }
        }

        // ---- 9. Profile query ----
        const profilesPromise = User.findAll({
            attributes: [
                'id',
                [
                    Sequelize.literal(`
                        CONCAT(
                            "User"."first_name",
                            CASE WHEN "profile"."last_name_on" = TRUE
                                 THEN CONCAT(' ', "User"."last_name") ELSE '' END,
                            CASE WHEN "profile"."other_names_on" = TRUE
                                 THEN CONCAT(' ', "User"."other_names") ELSE '' END
                        )
                    `),
                    'name',
                ],
                'gender',
                'city',
                [ageLiteral, 'age'],
                [distanceLiteral, 'distance_from'],
                'is_online',
                'last_seen',
            ],
            include: [
                {
                    model: UserProfile,
                    as: 'profile',
                    attributes: [],
                    required: false,
                },
                {
                    model: UserPicture,
                    as: 'pictures',
                    attributes: ['path', 'position'],
                    required: false,
                    separate: true,
                    order: [['position', 'ASC']],
                },
                {
                    // Anti-join: encounters I initiated toward the candidate.
                    model: Encounter,
                    as: 'receivedEncounters',
                    attributes: [],
                    required: false,
                    where: { initiator_id: currentUserId },
                },
            ],
            where: {
                id: { [Op.ne]: currentUserId },
                latitude: { [Op.ne]: null },
                longitude: { [Op.ne]: null },
                '$receivedEncounters.id$': { [Op.is]: null },
                ...genderClause,
                ...onlineClause,
                ...premiumClause,
                [Op.and]: andConditions,
            },
            // Sort:
            //   1. Online users first
            //   2. Among offline, most recently seen first
            //   3. Then by distance ascending as a tie-breaker
            order: [
                ['is_online', 'DESC'],
                ['last_seen', 'DESC NULLS LAST'],
                [Sequelize.literal('distance_from'), 'ASC'],
            ],
            limit: effectiveLimit,
            offset: requestedOffset,
            replacements: { lat, lng, maxDistance: maxDistanceKm },
            subQuery: false,
        });

        const [me, users] = await Promise.all([myselfPromise, profilesPromise]);

        const effectiveOnlineOnly = currentUserIsPremium ? onlineOnly : false;
        const effectivePremiumOnly = currentUserIsPremium ? premiumOnly : false;

        // ---- 10. Respond ----
        return res.json({
            success: true,
            myself: formatMyself(me),
            filter: formatFilter(filter, effectiveOnlineOnly, effectivePremiumOnly),
            users,
            quota: quotaPayload,
            quotaExhausted: false,
            adEveryN: AD_EVERY_N_CARDS,
        });
    } catch (error) {
        console.error('Error fetching encounter profiles:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch encounter profiles',
            error: error.message,
        });
    }
};

/* ---------------------------------------------------------------- */
/* Helpers                                                          */
/* ---------------------------------------------------------------- */
function clamp(n, min, max) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function parseBool(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
    return null;
}

function formatFilter(filter, effectiveOnlineOnly, effectivePremiumOnly) {
    if (!filter) return null;
    return {
        max_distance_km: filter.max_distance_km,
        interested_in: filter.interested_in,
        min_age: filter.min_age,
        max_age: filter.max_age,
        online_only: effectiveOnlineOnly,
        premium_only: effectivePremiumOnly,
    };
}

// TODO: When we start deriving max_age dynamically, uncomment this and
// remove the hardcoded 100 in setupBasicProfile.
//
// function calculateAge(dob) {
//     if (!dob) return null;
//     const d = new Date(dob);
//     if (Number.isNaN(d.getTime())) return null;
//     const diff = Date.now() - d.getTime();
//     return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
// }


exports.likeUser = async (req, res) => {
    try {
        const result = validationResult(req);
        const errors = organizeErrors(result.array());
        if (!result.isEmpty()) return res.send({ errors });

        const { id: initiator_id } = req.user;
        const { recipient_id } = req.body;

        // ---- 1. Already acted on this user? ----
        const existingEncounter = await Encounter.findOne({
            where: { initiator_id, recipient_id },
        });
        if (existingEncounter) {
            return res.send({ success: false, alreadySeen: true, match: false });
        }

        // ---- 2. Has the recipient already liked me? ----
        const reciprocalEncounter = await Encounter.findOne({
            where: {
                initiator_id: recipient_id,
                recipient_id: initiator_id,
                action: {
                    [Op.in]: [
                        ENCOUNTER_ACTION.LIKE,
                        ENCOUNTER_ACTION.SUPER_LIKE,
                    ],
                },
            },
        });

        let match = false;
        let matchRecord = null;
        let chatRecord = null;

        if (reciprocalEncounter) {
            // ---- 3a. Idempotency: don't create a duplicate Match ----
            // The pair is unordered; check both orientations.
            const existingMatch = await Match.findOne({
                where: {
                    [Op.or]: [
                        { initiator_id: recipient_id, seconder_id: initiator_id },
                        { initiator_id: initiator_id, seconder_id: recipient_id },
                    ],
                },
            });

            if (existingMatch) {
                matchRecord = existingMatch;
                match = true;
            } else {
                // The other user liked first, so they are the initiator and
                // the current user is the seconder.
                matchRecord = await Match.create({
                    initiator_id: recipient_id,
                    seconder_id: initiator_id,
                });
                match = true;
            }

            // ---- 3b. Ensure a Chat exists for this match ----
            const existingChat = await Chat.findOne({
                where: {
                    [Op.or]: [
                        { initiator_id: recipient_id, seconder_id: initiator_id },
                        { initiator_id: initiator_id, seconder_id: recipient_id },
                    ],
                },
            });

            if (existingChat) {
                chatRecord = existingChat;
            } else {
                chatRecord = await Chat.create({
                    initiator_id: recipient_id,
                    seconder_id: initiator_id,
                    starter_type: CHAT_STARTER.MATCH,
                });
            }
        }

        // ---- 4. Persist the current user's like ----
        req.body.initiator_id = initiator_id;
        await Encounter.create(req.body);

        // ---- 5. Quota ----
        const quota = await getQuota(req.user);
        await incrementQuota(quota, 1);

        return res.send({
            success: true,
            match,
            matchId: matchRecord?.id || null,
            chatId: chatRecord?.id || null,
            recipient: {
                id: recipient_id,
                name: req.body.recipient_name || null,
            },
        });
    } catch (error) {
        console.error('likeUser error:', error);
        return res.status(500).send({ success: false, error: error.message });
    }
};

exports.getUsersWhoLikeMe = async (req, res) => {
    const { id: currentUserId } = req.user;

    // 1. Get IDs of users that the current user has already liked
    const usersAlreadyLikedByMe = await Encounter.findAll({
        where: {
            initiator_id: currentUserId,
            action: {
                [Op.in]: [
                    ENCOUNTER_ACTION.LIKE,
                    ENCOUNTER_ACTION.DISLIKE,
                ],
            },
        },
        attributes: ['recipient_id'],
        raw: true
    }).then(results => results.map(row => row.recipient_id));

    // 2. Fetch incoming likes excluding already reciprocated users
    const incomingLikes = await Encounter.findAll({
        attributes: [
            'id',
            [
                Sequelize.literal(`
                TRIM(
                    CONCAT(
                        "initiator"."first_name", 
                        CASE 
                            WHEN "initiator->profile"."last_name_on" = TRUE AND "initiator"."last_name" IS NOT NULL 
                            THEN CONCAT(' ', "initiator"."last_name") 
                            ELSE '' 
                        END,
                        CASE 
                            WHEN "initiator->profile"."other_names_on" = TRUE AND "initiator"."other_names" IS NOT NULL 
                            THEN CONCAT(' ', "initiator"."other_names") 
                            ELSE '' 
                        END
                    )
                )
            `),
                'name'
            ],
            ['createdAt', 'liked_at'],
            ['seen_in_users_who_like_me', 'seen'],
            'action',
            [
                Sequelize.literal(`
                DATE_PART('year', AGE(CURRENT_DATE, "initiator"."date_of_birth"))::integer
            `),
                'age'
            ],
            [
                Sequelize.literal(`
                (
                    SELECT json_agg(
                        json_build_object(
                            'path', up."path",
                            'position', up."position"
                        ) ORDER BY up."position" ASC
                    )
                    FROM "UserPictures" up
                    WHERE up."user_id" = "initiator"."id"
                )
            `),
                'pictures'
            ],
            [
                Sequelize.literal('"initiator"."id"'),
                'user_id'
            ],
            [
                Sequelize.literal('"initiator"."country"'),
                'country'
            ]
        ],
        where: {
            recipient_id: currentUserId,
            action: {
                [Op.in]: [
                    ENCOUNTER_ACTION.LIKE,
                    ENCOUNTER_ACTION.SUPER_LIKE,
                ],
            },
            initiator_id: {
                [Op.notIn]: usersAlreadyLikedByMe
            }
        },
        include: [
            {
                model: User,
                as: 'initiator',
                attributes: [],
                include: [
                    {
                        model: UserProfile,
                        as: 'profile',
                        attributes: []
                    }
                ]
            }
        ],
        order: [['createdAt', 'DESC']],
        raw: true
    });

    // Process the results to handle null pictures
    const likesx = incomingLikes.map(like => ({
        ...like,
        pictures: like.pictures || [] // Ensure pictures is always an array
    }));

    const likes = incomingLikes.map(like => ({
        ...like, liked_at: moment(like.liked_at, 'YYYYMMDD').fromNow()
    }))

    const unseen = likes.some(like => !like.seen);

    let success = true;
    res.send({ success, unseen, likes });
}

exports.markLikesAsSeen = async (req, res) => {
    try {
        const currentUser = req.user;
        if (!currentUser) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { id: currentUserId } = currentUser;

        // Accept a single id or an array of ids for flexibility.
        const raw = req.body?.initiator_ids ?? req.body?.initiator_id;
        const initiatorIds = Array.isArray(raw) ? raw : raw ? [raw] : [];

        if (initiatorIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one initiator_id is required.',
            });
        }

        // Only mark rows where:
        //   - I am the recipient (someone liked ME)
        //   - the initiator is one of the ids passed in
        //   - it hasn't already been marked seen (so we don't overwrite the
        //     original timestamp on repeat calls)
        const [updated] = await Encounter.update(
            {
                seen_in_users_who_like_me: true,
                seen_in_users_who_like_me_at: new Date(),
            },
            {
                where: {
                    recipient_id: currentUserId,
                    initiator_id: { [Op.in]: initiatorIds },
                    seen_in_users_who_like_me: false,
                },
            }
        );

        return res.json({
            success: true,
            updated,
            initiator_ids: initiatorIds,
        });
    } catch (error) {
        console.error('Error marking likes as seen:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to mark likes as seen',
            error: error.message,
        });
    }
};


exports.dislikeUser = async (req, res) => {
    try {
        const result = validationResult(req);
        const errors = organizeErrors(result.array());
        if (!result.isEmpty()) return res.send({ errors });

        const { id: initiator_id } = req.user;
        const { recipient_id } = req.body;

        const existingEncounter = await Encounter.findOne({
            where: { initiator_id, recipient_id },
        });

        // Already encountered — do NOT count again, do NOT increment quota
        if (existingEncounter) return res.send({ success: false, alreadySeen: true });

        req.body.initiator_id = initiator_id;
        await Encounter.create(req.body);

        // Quota increment: 1 profile consumed per new encounter
        const quota = await getQuota(req.user);
        await incrementQuota(quota, 1);

        return res.send({ success: true });
    } catch (error) {
        console.error('dislikeUser error:', error);
        return res.status(500).send({ success: false, error: error.message });
    }
};

exports.getUsersWhoDisLikeMe = async (req, res) => {
    const { id: currentUserId } = req.user;

    const incomingDisLikes = await Encounter.findAll({
        attributes: [
            'id',
            [
                Sequelize.literal(`
                TRIM(
                    CONCAT(
                        "initiator"."first_name", 
                        CASE 
                            WHEN "initiator->profile"."last_name_on" = TRUE AND "initiator"."last_name" IS NOT NULL 
                            THEN CONCAT(' ', "initiator"."last_name") 
                            ELSE '' 
                        END,
                        CASE 
                            WHEN "initiator->profile"."other_names_on" = TRUE AND "initiator"."other_names" IS NOT NULL 
                            THEN CONCAT(' ', "initiator"."other_names") 
                            ELSE '' 
                        END
                    )
                )
            `),
                'name'
            ],
            ['updatedAt', 'disliked_at'],
            ['seen_in_users_who_dislike_me', 'seen'],
            [
                Sequelize.literal(`
                DATE_PART('year', AGE(CURRENT_DATE, "initiator"."date_of_birth"))::integer
            `),
                'age'
            ],
            [
                Sequelize.literal(`
                (
                    SELECT json_agg(
                        json_build_object(
                            'path', up."path",
                            'position', up."position"
                        ) ORDER BY up."position" ASC
                    )
                    FROM "UserPictures" up
                    WHERE up."user_id" = "initiator"."id"
                )
            `),
                'pictures'
            ],
            [
                Sequelize.literal('"initiator"."id"'),
                'user_id'
            ],
            [
                Sequelize.literal('"initiator"."country"'),
                'country'
            ]
        ],
        where: {
            recipient_id: currentUserId,
            action: ENCOUNTER_ACTION.DISLIKE,
        },
        include: [
            {
                model: User,
                as: 'initiator',
                attributes: [],
                include: [
                    {
                        model: UserProfile,
                        as: 'profile',
                        attributes: []
                    }
                ]
            }
        ],
        order: [['updatedAt', 'DESC']],
        raw: true
    });

    const disLikes = incomingDisLikes.map(dislike => ({
        ...dislike, disliked_at: moment(dislike.disliked_at, 'YYYYMMDD').fromNow()
    }))

    const unseen = disLikes.some(like => !like.seen);

    let success = true;
    res.send({ success, unseen, disLikes });
}

exports.getUsersDisLikedByMe = async (req, res) => {
    const { id: currentUserId } = req.user;

    const incomingDisLikes = await Encounter.findAll({
        attributes: [
            'id',
            [
                Sequelize.literal(`
                TRIM(
                    CONCAT(
                        "recipient"."first_name", 
                        CASE 
                            WHEN "recipient->profile"."last_name_on" = TRUE AND "recipient"."last_name" IS NOT NULL 
                            THEN CONCAT(' ', "recipient"."last_name") 
                            ELSE '' 
                        END,
                        CASE 
                            WHEN "recipient->profile"."other_names_on" = TRUE AND "recipient"."other_names" IS NOT NULL 
                            THEN CONCAT(' ', "recipient"."other_names") 
                            ELSE '' 
                        END
                    )
                )
            `),
                'name'
            ],
            ['updatedAt', 'disliked_at'],
            ['seen_in_users_disliked_by_me', 'seen'],
            [
                Sequelize.literal(`
                DATE_PART('year', AGE(CURRENT_DATE, "recipient"."date_of_birth"))::integer
            `),
                'age'
            ],
            [
                Sequelize.literal(`
                (
                    SELECT json_agg(
                        json_build_object(
                            'path', up."path",
                            'position', up."position"
                        ) ORDER BY up."position" ASC
                    )
                    FROM "UserPictures" up
                    WHERE up."user_id" = "recipient"."id"
                )
            `),
                'pictures'
            ],
            [
                Sequelize.literal('"recipient"."id"'),
                'user_id'
            ],
            [
                Sequelize.literal('"recipient"."country"'),
                'country'
            ]
        ],
        where: {
            recipient_id: currentUserId,
            action: ENCOUNTER_ACTION.DISLIKE,
        },
        include: [
            {
                model: User,
                as: 'recipient',
                attributes: [],
                include: [
                    {
                        model: UserProfile,
                        as: 'profile',
                        attributes: []
                    }
                ]
            }
        ],
        order: [['updatedAt', 'DESC']],
        raw: true
    });

    const disLikes = incomingDisLikes.map(dislike => ({
        ...dislike, disliked_at: moment(dislike.disliked_at, 'YYYYMMDD').fromNow()
    }))

    const unseen = disLikes.some(like => !like.seen);

    let success = true;
    res.send({ success, unseen, disLikes });
}

exports.getNewLikesCount = async (req, res) => {
    const userId = req.user.id;

    // 1. Get IDs of users that the current user has already liked
    const usersAlreadyLikedByMe = await Encounter.findAll({
        where: {
            initiator_id: userId,
            action: {
                [Op.in]: [
                    ENCOUNTER_ACTION.LIKE,
                    ENCOUNTER_ACTION.SUPER_LIKE,
                ],
            }
        },
        attributes: ['recipient_id'],
        raw: true
    }).then(results => results.map(row => row.recipient_id));

    // 2. Fetch count of incoming likes excluding already reciprocated users

    const count = await Encounter.count({
        where: {
            recipient_id: userId,
            seen_in_users_who_like_me: false,
            seen_in_users_who_like_me_at: null,
            action: {
                [Op.in]: [
                    ENCOUNTER_ACTION.LIKE,
                    ENCOUNTER_ACTION.SUPER_LIKE,
                ],
            },
            initiator_id: {
                [Op.notIn]: usersAlreadyLikedByMe
            }
        },
    });

    const success = true;
    res.send({ success, count });
}