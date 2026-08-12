const { validationResult, matchedData } = require('express-validator');
const { Sequelize, Op } = require('sequelize');
const moment = require('moment');

const { organizeErrors } = require('../utils/functions');

const Encounter = require('../models/Encounter');
const Match = require('../models/Match');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const { ENCOUNTER_ACTION, MATCH_STATUS } = require('../utils/constants');
const UserPicture = require('../models/UserPicture');

User.hasMany(Encounter, { foreignKey: 'initiator_id', as: 'initiatedEncounters' });
User.hasMany(Encounter, { foreignKey: 'recipient_id', as: 'receivedEncounters' });

Encounter.belongsTo(User, { foreignKey: 'initiator_id', as: 'initiator' });
Encounter.belongsTo(User, { foreignKey: 'recipient_id', as: 'recipient' });


exports.likeUser = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: initiator_id } = req.user;
    const { recipient_id, action } = req.body;
    let match = false;
    let success = false;

    const existingEncounter = await Encounter.findOne({
        where: { initiator_id, recipient_id }
    });

    if (existingEncounter) return res.send({ success });

    const reciprocalEncounter = await Encounter.findOne({
        where: {
            initiator_id: recipient_id, recipient_id: initiator_id,
            action: { [Op.in]: [ENCOUNTER_ACTION.LIKE, ENCOUNTER_ACTION.SUPER_LIKE] }
        }
    });

    if (reciprocalEncounter) {
        match = true;
        await Match.create({ initiator_id: reciprocalEncounter.initiator_id, seconder_id: initiator_id });
    }

    req.body.initiator_id = initiator_id;
    await Encounter.create(req.body);

    success = true;
    res.send({ success, match });
}

exports.getUsersWhoLikeMe = async (req, res) => {
    const { id: currentUserId } = req.user;

    // 1. Get IDs of users that the current user has already liked
    const usersAlreadyLikedByMe = await Encounter.findAll({
        where: {
            initiator_id: currentUserId,
            action: ENCOUNTER_ACTION.LIKE
        },
        attributes: ['recipient_id'],
        raw: true
    }).then(results => results.map(row => row.recipient_id));

    // 2. Fetch incoming likes excluding already reciprocated users
    const incomingLikes = await Encounter.findAll({
        attributes: [
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
            action: ENCOUNTER_ACTION.LIKE,
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
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: initiator_id } = req.user;
    const { recipient_id, action } = req.body;
    let match = false;
    let success = false;

    const existingEncounter = await Encounter.findOne({
        where: { initiator_id, recipient_id }
    });

    if (existingEncounter) return res.send({ success });

    req.body.initiator_id = initiator_id;
    await Encounter.create(req.body);

    success = true;
    res.send({ success });
}

exports.getUsersWhoDisLikeMe = async (req, res) => {
    const { id: currentUserId } = req.user;

    const incomingDisLikes = await Encounter.findAll({
        attributes: [
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