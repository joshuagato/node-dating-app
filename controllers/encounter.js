const { validationResult, matchedData } = require('express-validator');
const { Sequelize, Op } = require('sequelize');
const moment = require('moment');

const { organizeErrors } = require('../utils/functions');
const { ENCOUNTER_ACTION, MATCH_STATUS, FREE_DAILY_ENCOUNTER_LIMIT, AD_EVERY_N_CARDS, FREE_DAILY_WINDOW_MS, CHAT_STARTER,
    GENDER, MAX_DISTANCE_FREE_KM, MAX_DISTANCE_PREMIUM_KM, DEFAULT_MAX_DISTANCE_FREE_KM, DEFAULT_MAX_DISTANCE_PREMIUM_KM
} = require('../utils/constants');
const { getQuota, incrementQuota } = require('../utils/encounterQuota');
const { sendNotification } = require('../services/notificationService');
const { onlineUsers } = require('../sockets/chatSocket');

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
    };
}

/* ---------------------------------------------------------------- */
/* GET /encounters                                                   */
/* ---------------------------------------------------------------- */
exports.getEncountersProfiles = async (req, res) => {
    try {
        const currentUser = req.user;
        if (!currentUser) {
            return res
                .status(401)
                .json({ success: false, message: 'Unauthorized' });
        }

        const { id: currentUserId } = currentUser;

        const lat = Number(currentUser.latitude);
        const lng = Number(currentUser.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
                success: false,
                message:
                    'Your location is not set. Please update your profile location.',
            });
        }

        // ---- Determine premium up front (needed for defaults) ----
        const quota = await getQuota(currentUser);
        const currentUserIsPremium = quota.isPremium;

        // ---- Load (or lazily create) the user's filter row ----
        let filter = await EncountersFilter.findOne({
            where: { user_id: currentUserId },
        });

        if (!filter) {
            filter = await EncountersFilter.create({
                user_id: currentUserId,
                max_distance_km: currentUserIsPremium
                    ? DEFAULT_MAX_DISTANCE_PREMIUM_KM
                    : DEFAULT_MAX_DISTANCE_FREE_KM,
                interested_in:
                    currentUser.interested_in || GENDER.EVERYONE,
                min_age: 18,
                max_age: 100,
                online_only: false,
                premium_only: false,
                filter_mode: 'distance',
                country: null,
            });
        }

        // ---- Quota payload ----
        const quotaPayload = quota.isPremium
            ? null
            : {
                limit: quota.limit,
                seen: quota.seen,
                remaining: quota.remaining,
                resetsAt: quota.resetsAt,
            };

        // ---- "myself" ----
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
                'country',
                'latitude',
                'longitude',
                'is_online',
                'last_seen',
                'date_of_birth',
                'interested_in',
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
                    model: EncountersFilter,
                    as: 'encountersFilter',
                    required: false,
                },
            ],
        });

        // ---- Short-circuit on quota exhaustion ----
        if (!quota.isPremium && quota.exhausted) {
            const me = await myselfPromise;
            return res.status(200).json({
                success: true,
                myself: formatMyself(me),
                filter: formatFilter(filter, currentUserIsPremium),
                users: [],
                quota: quotaPayload,
                quotaExhausted: true,
                adEveryN: AD_EVERY_N_CARDS,
                message: 'Daily encounter limit reached. Come back later.',
            });
        }

        // ---- Cap limit by remaining quota ----
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

        // ---- Effective filter values ----
        // For free users we always force 'distance' mode — country mode is
        // a premium feature.
        const isCountryMode =
            currentUserIsPremium && filter.filter_mode === 'country';
        const onlineOnly = currentUserIsPremium
            ? filter.online_only
            : false;
        const premiumOnly = currentUserIsPremium
            ? filter.premium_only
            : false;

        // Distance caps: free = 1000, premium = 3000.
        const maxDistanceAllowed = currentUserIsPremium
            ? MAX_DISTANCE_PREMIUM_KM
            : MAX_DISTANCE_FREE_KM;
        const maxDistanceKm = Math.min(
            filter.max_distance_km || maxDistanceAllowed,
            maxDistanceAllowed
        );

        // ---- Shared SQL fragments ----
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

        // ---- Build AND conditions ----
        const andConditions = [
            Sequelize.where(ageLiteral, {
                [Op.gte]: filter.min_age,
            }),
            Sequelize.where(ageLiteral, {
                [Op.lte]: filter.max_age,
            }),
        ];

        // Distance constraint only applies in distance mode.
        // (Country mode drops the distance constraint entirely.)
        if (!isCountryMode) {
            andConditions.push(
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
                `)
            );
        }

        // Gender / online / premium clauses
        const genderClause = {};
        if (
            filter.interested_in &&
            filter.interested_in !== GENDER.EVERYONE
        ) {
            genderClause.gender =
                filter.interested_in === GENDER.MEN
                    ? GENDER.MAN
                    : GENDER.WOMAN;
        }

        const onlineClause = {};
        const premiumClause = {};
        if (currentUserIsPremium) {
            if (onlineOnly) onlineClause.is_online = true;
            if (premiumOnly) premiumClause.is_premium = true;
        }

        // Country clause (only used in country mode)
        const countryClause = {};
        if (isCountryMode && filter.country) {
            // Case-insensitive exact match against the users table.
            countryClause.country = Sequelize.where(
                Sequelize.fn('LOWER', Sequelize.col('User.country')),
                Sequelize.fn(
                    'LOWER',
                    Sequelize.literal(`'${filter.country.replace(/'/g, "''")}'`)
                )
            );
        }

        // ---- Query ----
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
                'country',
                [ageLiteral, 'age'],
                [distanceLiteral, 'distance_from'],
                'is_online',
                'last_seen',
                [Sequelize.literal('"profile"."bio"'), 'bio'],
                [Sequelize.literal('"profile"."education"'), 'education'],
                [
                    Sequelize.literal('"profile"."reason_on_app"'),
                    'reason_on_app',
                ],
                [
                    Sequelize.literal('"profile"."relationship_status"'),
                    'relationship_status',
                ],
                [Sequelize.literal('"profile"."height_cm"'), 'height_cm'],
                [Sequelize.literal('"profile"."smoking"'), 'smoking'],
                [Sequelize.literal('"profile"."drinking"'), 'drinking'],
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
                ...countryClause,
                [Op.and]: andConditions,
            },
            order: [
                ['is_online', 'DESC'],
                ['last_seen', 'DESC NULLS LAST'],
                // In country mode, ordering by distance is less meaningful
                // but harmless — you can swap this to `['last_seen', 'DESC']`
                // if you prefer country results to be purely recency-ordered.
                [Sequelize.literal('distance_from'), 'ASC'],
            ],
            limit: effectiveLimit,
            offset: requestedOffset,
            replacements: { lat, lng, maxDistance: maxDistanceKm },
            subQuery: false,
        });

        const [me, users] = await Promise.all([
            myselfPromise,
            profilesPromise,
        ]);

        return res.json({
            success: true,
            myself: formatMyself(me),
            filter: formatFilter(filter, currentUserIsPremium),
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
/* PUT /encounters/filter                                            */
/* ---------------------------------------------------------------- */
exports.saveEncountersFilter = async (req, res) => {
    try {
        const currentUser = req.user;
        if (!currentUser) {
            return res
                .status(401)
                .json({ success: false, message: 'Unauthorized' });
        }

        const { id: currentUserId } = currentUser;

        // Determine premium so we know which caps/modes are allowed.
        const quota = await getQuota(currentUser);
        const currentUserIsPremium = quota.isPremium;

        const maxDistanceAllowed = currentUserIsPremium
            ? MAX_DISTANCE_PREMIUM_KM
            : MAX_DISTANCE_FREE_KM;

        const body = req.body || {};

        // ---- Distance (clamped to the current user's cap) ----
        const rawDistance = Number(body.max_distance_km);
        const maxDistanceKm = Number.isFinite(rawDistance)
            ? clamp(rawDistance, 1, maxDistanceAllowed)
            : currentUserIsPremium
                ? DEFAULT_MAX_DISTANCE_PREMIUM_KM
                : DEFAULT_MAX_DISTANCE_FREE_KM;

        // ---- Age ----
        const minAge = clamp(parseInt(body.min_age, 10), 18, 100);
        const maxAge = clamp(parseInt(body.max_age, 10), 18, 100);
        const [safeMinAge, safeMaxAge] =
            minAge <= maxAge ? [minAge, maxAge] : [maxAge, minAge];

        // ---- Interested in ----
        const validGenders = Object.values(GENDER);
        const interestedIn = validGenders.includes(body.interested_in)
            ? body.interested_in
            : currentUser.interested_in || GENDER.EVERYONE;

        // ---- Toggles ----
        const onlineOnly = parseBool(body.online_only) ?? false;
        const premiumOnly = parseBool(body.premium_only) ?? false;

        // ---- Mode (country vs distance) ----
        // Free users are silently coerced to 'distance'.
        const requestedMode =
            body.filter_mode === 'country' ? 'country' : 'distance';
        const filterMode = currentUserIsPremium
            ? requestedMode
            : 'distance';

        // ---- Country ----
        // Only meaningful in country mode. Free users always get null.
        let country = null;
        if (filterMode === 'country' && body.country) {
            const trimmed = String(body.country).trim();
            if (trimmed.length > 0 && trimmed.length <= 100) {
                country = trimmed;
            }
        }

        // If country mode was requested but no valid country was supplied,
        // fall back to distance mode rather than silently matching nothing.
        const finalMode =
            filterMode === 'country' && !country ? 'distance' : filterMode;

        // ---- Upsert ----
        let filter = await EncountersFilter.findOne({
            where: { user_id: currentUserId },
        });

        const values = {
            max_distance_km: maxDistanceKm,
            interested_in: interestedIn,
            min_age: safeMinAge,
            max_age: safeMaxAge,
            online_only: onlineOnly,
            premium_only: premiumOnly,
            filter_mode: finalMode,
            country: finalMode === 'country' ? country : null,
        };

        if (!filter) {
            filter = await EncountersFilter.create({
                user_id: currentUserId,
                ...values,
            });
        } else {
            await filter.update(values);
        }

        return res.json({
            success: true,
            filter: formatFilter(filter, currentUserIsPremium),
        });
    } catch (error) {
        console.error('Error saving encounters filter:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to save encounters filter',
            error: error.message,
        });
    }
};

/* ---------------------------------------------------------------- */
/* GET /encounters/filter-countries                                  */
/* Returns the distinct, non-null countries present in the users     */
/* table, with a count per country, sorted alphabetically.           */
/* ---------------------------------------------------------------- */
exports.getFilterCountries = async (req, res) => {
    try {
        const currentUser = req.user;
        if (!currentUser) {
            return res
                .status(401)
                .json({ success: false, message: 'Unauthorized' });
        }

        // Only return countries that have at least N users so the list
        // stays useful (a country with 1 lonely user isn't a great filter).
        const MIN_USERS_PER_COUNTRY = 1;

        const rows = await User.findAll({
            attributes: [
                [Sequelize.fn('TRIM', Sequelize.col('country')), 'country'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'user_count'],
            ],
            where: {
                country: {
                    [Op.and]: [
                        { [Op.ne]: null },
                        { [Op.ne]: '' },
                    ],
                },
                // Don't show the current user's own country twice; it's fine
                // either way, but excluding self keeps the count honest.
                id: { [Op.ne]: currentUser.id },
            },
            group: [Sequelize.fn('TRIM', Sequelize.col('country'))],
            having: Sequelize.literal(
                `COUNT("User"."id") >= ${MIN_USERS_PER_COUNTRY}`
            ),
            order: [[Sequelize.fn('TRIM', Sequelize.col('country')), 'ASC']],
            raw: true,
        });

        const countries = rows
            .map((r) => ({
                country: r.country,
                user_count: Number(r.user_count),
            }))
            .filter((c) => c.country);

        return res.json({
            success: true,
            countries,
        });
    } catch (error) {
        console.error('Error fetching filter countries:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch filter countries',
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

function formatFilter(filter, isPremium) {
    if (!filter) return null;

    const maxDistanceAllowed = isPremium
        ? MAX_DISTANCE_PREMIUM_KM
        : MAX_DISTANCE_FREE_KM;

    // Country mode is premium-only — free users always see distance mode.
    const mode =
        isPremium && filter.filter_mode === 'country'
            ? 'country'
            : 'distance';

    return {
        max_distance_km: Math.min(
            filter.max_distance_km || maxDistanceAllowed,
            maxDistanceAllowed
        ),
        interested_in: filter.interested_in,
        min_age: filter.min_age,
        max_age: filter.max_age,
        online_only: isPremium ? filter.online_only : false,
        premium_only: isPremium ? filter.premium_only : false,
        filter_mode: mode,
        country: mode === 'country' ? filter.country : null,
        max_distance_km: maxDistanceAllowed, // handy for the slider max
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
        // const existingEncounter = await Encounter.findOne({
        //     where: { initiator_id, recipient_id },
        // });
        // if (existingEncounter) {
        //     return res.send({ success: false, alreadySeen: true, match: false });
        // }

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

        if (!onlineUsers.has(recipient_id)) {
            const recipient = await User.findByPk(recipient_id);
            const { notify_new_likes } = recipient;

            if (notify_new_likes) {
                await sendNotification({
                    recipientId: recipient_id,
                    actorId: initiator_id,
                    type: 'LIKE',
                    title: 'New Like! ❤️',
                    body: 'Someone liked your profile on Crushr!',
                    metadata: { url: '/likes' },
                    app: req.app
                });
            }
        }

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

        // const existingEncounter = await Encounter.findOne({
        //     where: { initiator_id, recipient_id },
        // });

        // // Already encountered — do NOT count again, do NOT increment quota
        // if (existingEncounter) return res.send({ success: false, alreadySeen: true });

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
    try {
        const { id: currentUserId } = req.user;
        if (!currentUserId) {
            return res
                .status(401)
                .json({ success: false, message: 'Unauthorized' });
        }

        const incomingDisLikes = await Encounter.findAll({
            attributes: [
                'id',
                [
                    Sequelize.literal(`
                        TRIM(
                            CONCAT(
                                "initiator"."first_name",
                                CASE
                                    WHEN "initiator->profile"."last_name_on" = TRUE
                                         AND "initiator"."last_name" IS NOT NULL
                                    THEN CONCAT(' ', "initiator"."last_name")
                                    ELSE ''
                                END,
                                CASE
                                    WHEN "initiator->profile"."other_names_on" = TRUE
                                         AND "initiator"."other_names" IS NOT NULL
                                    THEN CONCAT(' ', "initiator"."other_names")
                                    ELSE ''
                                END
                            )
                        )
                    `),
                    'name',
                ],
                ['updatedAt', 'disliked_at_raw'],
                ['seen_in_users_who_dislike_me', 'seen'],
                [
                    Sequelize.literal(`
                        DATE_PART('year', AGE(CURRENT_DATE, "initiator"."date_of_birth"))::integer
                    `),
                    'age',
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
                    'pictures',
                ],
                [Sequelize.literal('"initiator"."id"'), 'user_id'],
                [Sequelize.literal('"initiator"."country"'), 'country'],
                [Sequelize.literal('"initiator"."city"'), 'city'],
                [Sequelize.literal('"initiator"."is_online"'), 'is_online'],
                [Sequelize.literal('"initiator"."last_seen"'), 'last_seen'],
                [Sequelize.literal('"initiator"."gender"'), 'gender'],
                // Fields that live on UserProfile, not User:
                [Sequelize.literal('"initiator->profile"."bio"'), 'bio'],
                [Sequelize.literal('"initiator->profile"."education"'), 'education'],
                [
                    Sequelize.literal('"initiator->profile"."reason_on_app"'),
                    'reason_on_app',
                ],
                [
                    Sequelize.literal('"initiator->profile"."relationship_status"'),
                    'relationship_status',
                ],
                [
                    Sequelize.literal('"initiator->profile"."height_cm"'),
                    'height_cm',
                ],
                [Sequelize.literal('"initiator->profile"."smoking"'), 'smoking'],
                [Sequelize.literal('"initiator->profile"."drinking"'), 'drinking'],
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
                            attributes: [],
                        },
                    ],
                },
            ],
            order: [['updatedAt', 'DESC']],
            raw: true,
        });

        const disLikes = incomingDisLikes
            .filter((d) => d.user_id)
            .map((d) => ({
                ...d,
                pictures: Array.isArray(d.pictures) ? d.pictures : [],
                // Human-friendly relative time for display.
                disliked_at: moment(d.disliked_at_raw).fromNow(),
                // Raw timestamp for precise filtering on the client.
                disliked_at_iso: d.disliked_at_raw,
                // Strip the raw column from the response.
                disliked_at_raw: undefined,
            }));

        const unseen = disLikes.some((d) => !d.seen);

        return res.send({
            success: true,
            unseen,
            count: disLikes.length,
            disLikes,
        });
    } catch (error) {
        console.error('Error fetching users who disliked me:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message,
        });
    }
};

exports.getUsersDisLikedByMe = async (req, res) => {
    try {
        const { id: currentUserId } = req.user;
        if (!currentUserId) {
            return res
                .status(401)
                .json({ success: false, message: 'Unauthorized' });
        }

        const outgoingDislikes = await Encounter.findAll({
            attributes: [
                'id',
                [
                    Sequelize.literal(`
                        TRIM(
                            CONCAT(
                                "recipient"."first_name",
                                CASE
                                    WHEN "recipient->profile"."last_name_on" = TRUE
                                         AND "recipient"."last_name" IS NOT NULL
                                    THEN CONCAT(' ', "recipient"."last_name")
                                    ELSE ''
                                END,
                                CASE
                                    WHEN "recipient->profile"."other_names_on" = TRUE
                                         AND "recipient"."other_names" IS NOT NULL
                                    THEN CONCAT(' ', "recipient"."other_names")
                                    ELSE ''
                                END
                            )
                        )
                    `),
                    'name',
                ],
                ['updatedAt', 'disliked_at_raw'],
                ['seen_in_users_disliked_by_me', 'seen'],
                [
                    Sequelize.literal(`
                        DATE_PART('year', AGE(CURRENT_DATE, "recipient"."date_of_birth"))::integer
                    `),
                    'age',
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
                    'pictures',
                ],
                [Sequelize.literal('"recipient"."id"'), 'user_id'],
                [Sequelize.literal('"recipient"."country"'), 'country'],
                [Sequelize.literal('"recipient"."city"'), 'city'],
                [Sequelize.literal('"recipient"."is_online"'), 'is_online'],
                [Sequelize.literal('"recipient"."last_seen"'), 'last_seen'],
                [Sequelize.literal('"recipient"."gender"'), 'gender'],
                // Fields on UserProfile
                [Sequelize.literal('"recipient->profile"."bio"'), 'bio'],
                [Sequelize.literal('"recipient->profile"."education"'), 'education'],
                [
                    Sequelize.literal('"recipient->profile"."reason_on_app"'),
                    'reason_on_app',
                ],
                [
                    Sequelize.literal('"recipient->profile"."relationship_status"'),
                    'relationship_status',
                ],
                [
                    Sequelize.literal('"recipient->profile"."height_cm"'),
                    'height_cm',
                ],
                [Sequelize.literal('"recipient->profile"."smoking"'), 'smoking'],
                [Sequelize.literal('"recipient->profile"."drinking"'), 'drinking'],
            ],
            // FIX: current user is the INITIATOR (they did the disliking).
            // The other party is the RECIPIENT.
            where: {
                initiator_id: currentUserId,
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
                            attributes: [],
                        },
                    ],
                },
            ],
            order: [['updatedAt', 'DESC']],
            raw: true,
        });

        const disLikes = outgoingDislikes
            .filter((d) => d.user_id)
            .map((d) => ({
                ...d,
                pictures: Array.isArray(d.pictures) ? d.pictures : [],
                // Human-readable relative time for display.
                disliked_at: moment(d.disliked_at_raw).fromNow(),
                // Raw ISO for precise filtering.
                disliked_at_iso: d.disliked_at_raw,
                disliked_at_raw: undefined,
            }));

        const unseen = disLikes.some((d) => !d.seen);

        return res.send({
            success: true,
            unseen,
            count: disLikes.length,
            disLikes,
        });
    } catch (error) {
        console.error('Error fetching users I disliked:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message,
        });
    }
};

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