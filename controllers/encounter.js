const { validationResult, matchedData } = require('express-validator');
const { Sequelize, Op } = require('sequelize');
const moment = require('moment');

const { organizeErrors } = require('../utils/functions');
const { ENCOUNTER_ACTION, MATCH_STATUS, FREE_DAILY_ENCOUNTER_LIMIT, AD_EVERY_N_CARDS,
    FREE_DAILY_WINDOW_MS, CHAT_STARTER } = require('../utils/constants');
const { getQuota, incrementQuota } = require('../utils/encounterQuota');

const Encounter = require('../models/Encounter');
const Match = require('../models/Match');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserPicture = require('../models/UserPicture');
const DailyEncounterView = require('../models/DailyEncounterView');
const Chat = require('../models/Chat');

User.hasMany(Encounter, { foreignKey: 'initiator_id', as: 'initiatedEncounters' });
User.hasMany(Encounter, { foreignKey: 'recipient_id', as: 'receivedEncounters' });

Encounter.belongsTo(User, { foreignKey: 'initiator_id', as: 'initiator' });
Encounter.belongsTo(User, { foreignKey: 'recipient_id', as: 'recipient' });

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

        // ---- 2. Validate & normalise query params ----
        let maxDistanceKm = Number(req.query.max_distance);
        if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0) {
            maxDistanceKm = 11;
        }

        const requestedLimit = Math.max(
            1,
            Math.min(50, parseInt(req.query.limit, 10) || 20)
        );
        const requestedOffset = Math.max(
            0,
            parseInt(req.query.offset, 10) || 0
        );

        // ---- 3. Quota check (READ ONLY — increment happens in like/dislike) ----
        const quota = await getQuota(currentUser);

        const quotaPayload = quota.isPremium
            ? null
            : {
                limit: quota.limit,
                seen: quota.seen,
                remaining: quota.remaining,
                resetsAt: quota.resetsAt,
            };

        // ---- 4. Fetch "myself" separately ----
        // The main profile query excludes the current user, so we fetch their
        // own record with its own query. Needed by the frontend for chat
        // navigation and end-card rendering.
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
            ],
        });

        // ---- 5. Short-circuit when quota is exhausted ----
        if (!quota.isPremium && quota.exhausted) {
            const me = await myselfPromise;

            return res.status(200).json({
                success: true,
                myself: formatMyself(me),
                users: [],
                quota: quotaPayload,
                quotaExhausted: true,
                adEveryN: AD_EVERY_N_CARDS,
                message: 'Daily encounter limit reached. Come back later.',
            });
        }

        // ---- 6. Cap the effective limit by remaining quota ----
        const effectiveLimit = quota.isPremium
            ? requestedLimit
            : Math.min(requestedLimit, quota.remaining);

        // ---- 7. Profile query ----
        // Anti-join rule (STRICT ONE-DIRECTIONAL):
        //   - EXCLUDE any user the current user has already acted on
        //     (i.e. rows in `initiatedEncounters`).
        //   - DO NOT exclude users who acted on the current user first
        //     (`receivedEncounters` is intentionally NOT joined).
        //
        // `subQuery: false` is required because the anti-join condition
        // references the joined alias at the top level. It's safe here
        // because UserPicture is loaded with `separate: true`, so it can't
        // multiply the Users rows.
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
                [
                    Sequelize.literal(`
                DATE_PART('year', AGE(CURRENT_DATE, "User"."date_of_birth"))::integer
            `),
                    'age',
                ],
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
                    // LEFT JOIN on encounters where the CANDIDATE is the recipient.
                    // Combined with the include `where`, this matches encounters
                    // that I initiated *to this candidate*.
                    model: Encounter,
                    as: 'receivedEncounters',     // <-- the candidate's received side
                    attributes: [],
                    required: false,
                    where: { initiator_id: currentUserId },   // <-- me as initiator
                },
            ],
            where: {
                id: { [Op.ne]: currentUserId },
                latitude: { [Op.ne]: null },
                longitude: { [Op.ne]: null },

                // Anti-join: keep only candidates with NO matching encounter row.
                '$receivedEncounters.id$': { [Op.is]: null },

                [Op.and]: Sequelize.literal(`
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
            },
            order: [[Sequelize.literal('distance_from'), 'ASC']],
            limit: effectiveLimit,
            offset: requestedOffset,
            replacements: { lat, lng, maxDistance: maxDistanceKm },
            subQuery: false,
        });

        const [me, users] = await Promise.all([myselfPromise, profilesPromise]);

        // ---- 8. Respond (no quota increment here) ----
        return res.json({
            success: true,
            myself: formatMyself(me),
            users,
            quota: quotaPayload,        // null for premium
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
            ['updatedAt', 'liked_at'],
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
        order: [['updatedAt', 'DESC']],
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