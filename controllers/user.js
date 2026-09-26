const path = require('path');
const fs = require('fs');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');
const { Sequelize, Op, literal, where: seqWhere } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const {
    organizeErrors, deleteUserFields, getRawFile, calculateAge, getDisplayName
} = require('../utils/functions');
const { GENDER, cloudFactorPath } = require('../utils/constants');
const cloudinary = require('../config/cloudinary.js');

const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserPicture = require('../models/UserPicture');
const VerificationPicture = require('../models/VerificationPicture');
const Encounter = require('../models/Encounter');
const Subscription = require('../models/Subscription');
const EncountersFilter = require('../models/EncountersFilter');

// User -> UserProfile Associations
User.hasOne(UserProfile, { foreignKey: 'user_id', as: 'profile' });
UserProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user_profile' });


// User -> UserPicture Associations
User.hasMany(UserPicture, { foreignKey: 'user_id', as: 'pictures' });
UserPicture.belongsTo(User, { foreignKey: 'user_id', as: 'user_picture' });



exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Ensure a UserProfile row exists (with sensible defaults)
        const [userProfile] = await UserProfile.findOrCreate({
            where: { user_id: userId },
            defaults: {
                user_id: userId,
                last_name_on: false,
                other_names_on: false,
                gender_on: true,
            },
        });

        // 2. Fetch User + pictures (ordered by position)
        const user = await User.findByPk(userId, {
            attributes: [
                'id',
                'first_name',
                'last_name',
                'other_names',
                'gender',
                'interested_in',
                'date_of_birth',
                'country',
                'country_code',
                'city',
                'longitude',
                'latitude',
                'is_premium',
                'premium_expires_at',
                'premium_cycle',
            ],
            include: [
                {
                    model: UserPicture,
                    as: 'pictures',
                    attributes: ['id', 'path', 'position'],
                },
            ],
            order: [[{ model: UserPicture, as: 'pictures' }, 'position', 'ASC']],
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User profile not found.',
            });
        }

        // 3. Fetch the most recent subscription, regardless of status,
        //    plus the most recent ACTIVE one if it exists. Both are useful
        //    for the premium banner.
        const [latestSubscription, activeSubscription] = await Promise.all([
            Subscription.findOne({
                where: { user_id: userId },
                order: [['createdAt', 'DESC']],
            }),
            Subscription.findOne({
                where: { user_id: userId, status: 'active' },
                order: [['expires_at', 'DESC']],
            }),
        ]);

        // 4. Derive premium status.
        //    A user is considered premium only when BOTH the flag is on AND
        //    the expiry is in the future. This protects against a stale
        //    is_premium flag if a webhook failed to revoke.
        const now = new Date();
        const expiresAt = user.premium_expires_at
            ? new Date(user.premium_expires_at)
            : null;
        const isPremium = Boolean(
            user.is_premium && expiresAt && expiresAt > now
        );

        const daysRemaining = isPremium
            ? Math.max(
                0,
                Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            )
            : null;

        // 5. Expired subscription details (if any)
        let expiredInfo = null;
        if (!isPremium && latestSubscription && latestSubscription.expires_at) {
            const lastExpiry = new Date(latestSubscription.expires_at);
            if (lastExpiry < now) {
                const daysAgo = Math.max(
                    0,
                    Math.floor((now.getTime() - lastExpiry.getTime()) / (1000 * 60 * 60 * 24))
                );
                expiredInfo = {
                    expired_at: lastExpiry.toISOString(),
                    days_ago: daysAgo,
                    billing_cycle: latestSubscription.billing_cycle,
                };
            }
        }

        // 6. Build the response
        const responseData = {
            user: {
                id: user.id,
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                other_names: user.other_names || '',
                gender: user.gender || GENDER.MAN,
                interested_in: user.interested_in || GENDER.WOMEN,
                date_of_birth: user.date_of_birth || '',
                country: user.country || '',
                country_code: user.country_code || '',
                city: user.city || '',
                longitude:
                    user.longitude !== null && user.longitude !== undefined
                        ? String(user.longitude)
                        : '',
                latitude:
                    user.latitude !== null && user.latitude !== undefined
                        ? String(user.latitude)
                        : '',
            },
            profile: {
                bio: userProfile.bio || '',
                reason_on_app: userProfile.reason_on_app || '',
                education: userProfile.education || '',
                relationship_status: userProfile.relationship_status || 'Single',
                height_cm: userProfile.height_cm ? String(userProfile.height_cm) : '',
                smoking: userProfile.smoking || 'Never',
                drinking: userProfile.drinking || 'Socially',
            },
            profileVisibility: {
                last_name_on: Boolean(userProfile.last_name_on),
                other_names_on: Boolean(userProfile.other_names_on),
                gender_on:
                    userProfile.gender_on !== undefined
                        ? Boolean(userProfile.gender_on)
                        : true,
            },
            premium: {
                is_premium: isPremium,
                expires_at: isPremium ? expiresAt.toISOString() : null,
                days_remaining: daysRemaining,
                cycle: isPremium ? user.premium_cycle || null : null,
                latest_subscription_id: latestSubscription?.id || null,
                active_subscription_id: activeSubscription?.id || null,
                expired: expiredInfo,
            },
            pictures: (user.pictures || []).map((pic) => ({
                id: pic.id,
                path: pic.path,
                image_url: pic.path,
                position: pic.position,
            })),
        };

        return res.status(200).json({
            success: true,
            data: responseData,
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve profile data',
            error: error.message,
        });
    }
};

exports.getPartnerProfile = async (req, res) => {
    try {
        const { id: userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Fetch target user with associated UserProfile and UserPictures
        const user = await User.findByPk(userId, {
            attributes: [
                'id',
                'first_name',
                'last_name',
                'other_names',
                'gender',
                'interested_in',
                'date_of_birth',
                'country',
                'city',
                'is_online',
                'last_seen'
            ],
            include: [
                {
                    model: UserProfile,
                    as: 'profile',
                    attributes: [
                        'first_name_on',
                        'last_name_on',
                        'other_names_on',
                        'gender_on',
                        'bio',
                        'reason_on_app',
                        'education',
                        'relationship_status',
                        'height_cm',
                        'smoking',
                        'drinking'
                    ]
                },
                {
                    model: UserPicture,
                    as: 'pictures',
                    attributes: ['id', 'path', 'position']
                }
            ],
            order: [
                [{ model: UserPicture, as: 'pictures' }, 'position', 'ASC']
            ]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Partner profile not found.'
            });
        }

        const profileData = user.profile || {};

        // 1. Format Name based on visibility flags (first_name, last_name, other_names)
        const nameParts = [];
        if (profileData.first_name_on !== false && user.first_name) {
            nameParts.push(user.first_name);
        }
        if (profileData.other_names_on && user.other_names) {
            nameParts.push(user.other_names);
        }
        if (profileData.last_name_on && user.last_name) {
            nameParts.push(user.last_name);
        }

        const formattedName = nameParts.join(' ').trim() || user.first_name || 'Anonymous';

        // 2. Format Gender conditionally based on gender_on flag
        const formattedGender = profileData.gender_on ? user.gender : null;

        const responseData = {
            id: user.id,
            name: formattedName,
            gender: formattedGender,
            date_of_birth: user.date_of_birth,
            country: user.country || '',
            city: user.city || '',
            is_online: user.is_online,
            last_seen: user.last_seen,
            profile: {
                bio: profileData.bio || '',
                reason_on_app: profileData.reason_on_app || '',
                education: profileData.education || '',
                relationship_status: profileData.relationship_status || '',
                height_cm: profileData.height_cm || null,
                smoking: profileData.smoking || '',
                drinking: profileData.drinking || ''
            },
            pictures: user.pictures || []
        };

        return res.status(200).json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Error fetching partner profile:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve partner profile',
            error: error.message
        });
    }
};

exports.getNearbyUsers = async (req, res) => {
    const currentUser = req.user;
    if (!currentUser) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const userId = currentUser.id;
    const latitude = parseFloat(currentUser.latitude);
    const longitude = parseFloat(currentUser.longitude);
    const interestedIn = currentUser.interested_in;

    if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({
            success: false,
            message: 'User location not set. Please update your profile location.'
        });
    }

    // 1. Parameterized Haversine distance expression (in KM)
    const distanceExpression = `
            (6371 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians(${latitude})) * cos(radians("User"."latitude")) * 
                    cos(radians("User"."longitude") - radians(${longitude})) + 
                    sin(radians(${latitude})) * sin(radians("User"."latitude"))
                ))
            ))
        `;
    const distanceLiteral = Sequelize.literal(distanceExpression);

    // 2. Build WHERE clause
    const whereClause = {
        id: { [Op.ne]: userId },
        latitude: { [Op.ne]: null },
        longitude: { [Op.ne]: null }
    };

    // Gender filter check
    if (interestedIn && interestedIn !== GENDER.EVERYONE && interestedIn !== GENDER.EVERYONE) {
        const targetGender = interestedIn === GENDER.MEN ? GENDER.MAN : GENDER.WOMAN;
        whereClause.gender = targetGender;
    }

    // 3. Radius filter (Set to 20 km or your desired max distance)
    const MAX_RADIUS_KM = 200;
    const distanceCondition = Sequelize.where(distanceLiteral, Op.lte, MAX_RADIUS_KM);

    // 4. Query execution
    const users = await User.findAll({
        where: {
            [Op.and]: [
                whereClause,
                distanceCondition,

                // Anti-join: exclude any candidate the current user has
                // already acted on (i.e. rows in `encounters` where the
                // current user is the initiator).
                //
                // `receivedEncounters` is the candidate's received side of
                // the Encounter association. By constraining it to
                // `initiator_id = userId`, this join matches encounters
                // *I* initiated toward this candidate. The `IS NULL` check
                // below keeps only candidates with NO such row.
                //
                // This is strictly one-directional — it does NOT exclude
                // users who acted on me first. They still appear so I can
                // like them back and trigger a match.
                { '$receivedEncounters.id$': { [Op.is]: null } }
            ]
        },
        attributes: {
            include: [
                [distanceLiteral, 'distance']
            ],
            exclude: ['password', 'master_password', 'email_verified', 'signup_channel']
        },
        include: [
            {
                model: UserProfile,
                as: 'profile',
                attributes: ['last_name_on', 'other_names_on', 'gender_on', 'first_name_on']
            },
            {
                model: UserPicture,
                as: 'pictures',
                required: false,
                attributes: ['id', 'path', 'position']
            },
            {
                // LEFT JOIN on encounters where the CANDIDATE is the recipient.
                // Combined with the include `where`, this matches encounters
                // that I initiated *to this candidate*.
                model: Encounter,
                as: 'receivedEncounters',     // <-- the candidate's received side
                attributes: [],
                required: false,
                where: { initiator_id: userId },   // <-- me as initiator
            },
        ],
        // Mandatory when using limit + includes with custom WHERE clauses:
        subQuery: false,
        // Shortest distance first, longest last.
        order: [[distanceLiteral, 'ASC']],
        limit: 12
    });

    // 5. Format response
    const userProfiles = users.map(user => {
        const plain = user.toJSON();
        const profile = plain.profile || {};
        const pictures = plain.pictures || [];

        // Sort pictures by position manually if ordered association was affected by subQuery: false
        pictures.sort((a, b) => (a.position || 0) - (b.position || 0));

        const displayName = getDisplayName(plain, profile);
        const age = calculateAge(plain.date_of_birth);
        const distance = plain.distance != null ? parseFloat(plain.distance) : null;

        return {
            id: plain.id,
            name: displayName,
            age: age,
            gender: plain.gender,
            bio: plain.bio || null,
            occupation: plain.occupation || null,
            education: plain.education || null,
            distance: distance !== null ? Math.ceil(distance) : null,
            isOnline: plain.is_online || false,
            lastSeen: plain.last_seen,
            pictures: pictures.map(p => p.path)
        };
    });

    return res.json({
        success: true,
        userProfiles
    });
};


exports.updateProfile = async (req, res) => {
    const transaction = await postgresSequelize.transaction();

    try {
        const userId = req.user.id;

        // Parse JSON payloads sent via FormData
        const userData = typeof req.body.user === 'string' ? JSON.parse(req.body.user) : req.body.user;
        const profileData = typeof req.body.profile === 'string' ? JSON.parse(req.body.profile) : req.body.profile;
        const visibilityData = typeof req.body.visibility === 'string' ? JSON.parse(req.body.visibility) : req.body.visibility;
        const pictureMeta = typeof req.body.pictureMeta === 'string' ? JSON.parse(req.body.pictureMeta) : (req.body.pictureMeta || []);

        /* -------------------------------------------------------------------------- */
        /* 1. UPDATE USER CORE DETAILS                                                */
        /* -------------------------------------------------------------------------- */
        if (userData) {
            await User.update({
                first_name: userData.first_name,
                last_name: userData.last_name,
                other_names: userData.other_names,
                gender: userData.gender,
                interested_in: userData.interested_in,
                date_of_birth: userData.date_of_birth,
                country: userData.country,
                country_code: userData.country_code
                    ? userData.country_code.toLowerCase()
                    : null,
                city: userData.city,
                latitude: userData.latitude,
                longitude: userData.longitude,
            }, {
                where: { id: userId },
                transaction,
            });
        }

        /* -------------------------------------------------------------------------- */
        /* 2. UPDATE USER PROFILE (ATTRIBUTES & VISIBILITY)                           */
        /* -------------------------------------------------------------------------- */
        const profilePayload = {};

        if (visibilityData) {
            profilePayload.last_name_on = Boolean(visibilityData.last_name_on);
            profilePayload.other_names_on = Boolean(visibilityData.other_names_on);
            profilePayload.gender_on = Boolean(visibilityData.gender_on);
        }

        if (profileData) {
            if (profileData.bio !== undefined) profilePayload.bio = profileData.bio ? profileData.bio.trim() : null;
            if (profileData.reason_on_app !== undefined) profilePayload.reason_on_app = profileData.reason_on_app;
            if (profileData.education !== undefined) profilePayload.education = profileData.education;
            if (profileData.relationship_status !== undefined) profilePayload.relationship_status = profileData.relationship_status;
            if (profileData.height_cm !== undefined) profilePayload.height_cm = profileData.height_cm ? parseInt(profileData.height_cm, 10) : null;
            if (profileData.smoking !== undefined) profilePayload.smoking = profileData.smoking;
            if (profileData.drinking !== undefined) profilePayload.drinking = profileData.drinking;
        }

        if (Object.keys(profilePayload).length > 0) {
            const [existingProfile] = await UserProfile.findOrCreate({
                where: { user_id: userId },
                defaults: { user_id: userId, ...profilePayload },
                transaction,
            });

            if (existingProfile) {
                await UserProfile.update(profilePayload, {
                    where: { user_id: userId },
                    transaction,
                });
            }
        }

        /* -------------------------------------------------------------------------- */
        /* 3. REORDER EXISTING PICTURES (no file I/O)                                 */
        /* -------------------------------------------------------------------------- */
        // The client sends the full ordering in `pictureMeta`, so reorder
        // regardless of whether new files are being uploaded.
        for (const meta of pictureMeta) {
            if (meta.dbId) {
                await UserPicture.update(
                    { position: meta.position },
                    {
                        where: { id: meta.dbId, user_id: userId },
                        transaction,
                    }
                );
            }
        }

        /* -------------------------------------------------------------------------- */
        /* 4. UPLOAD & INSERT NEW PICTURES                                            */
        /* -------------------------------------------------------------------------- */
        if (req.files && req.files.length > 0) {
            const platform = (process.env.HOSTING_PLATFORM || '').toLowerCase();

            for (const file of req.files) {
                const slotMatch = file.fieldname.match(/picture_slot_(\d+)/);
                const position = slotMatch ? parseInt(slotMatch[1], 10) : null;

                if (position) {
                    let imagePath = null;

                    if (platform === 'render') {
                        // Option A: Upload memory buffer to Cloudinary
                        const uploadResult = await new Promise((resolve, reject) => {
                            const stream = cloudinary.uploader.upload_stream(
                                {
                                    folder: 'crushr/user-pictures',
                                    resource_type: 'image',
                                },
                                (error, result) => {
                                    if (error) return reject(error);
                                    resolve(result);
                                }
                            );
                            stream.end(file.buffer);
                        });

                        imagePath = uploadResult.secure_url;

                    } else if (platform === 'vps') {
                        // Option B: Relative disk path
                        imagePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');

                    } else {
                        throw new Error('Invalid or missing HOSTING_PLATFORM environment variable.');
                    }

                    await UserPicture.create({
                        user_id: userId,
                        path: imagePath,
                        position,
                    }, { transaction });
                }
            }
        }

        await transaction.commit();

        const updatedUser = await User.findByPk(userId, {
            include: [
                { model: UserProfile, as: 'profile' },
                { model: UserPicture, as: 'pictures' },
            ],
        });

        return res.send({
            success: true,
            message: 'Profile updated successfully.',
            data: updatedUser,
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Profile update error:', error);
        return res.status(500).send({
            success: false,
            message: 'Failed to update profile',
            error: error.message,
        });
    }
};

exports.deletePicture = async (req, res) => {
    const transaction = await postgresSequelize.transaction();

    try {
        const userId = req.user.id;
        const { id: pictureId } = req.params;

        if (!pictureId) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Picture id is required.',
            });
        }

        // 1. Find the picture and verify it belongs to this user
        const picture = await UserPicture.findOne({
            where: { id: pictureId, user_id: userId },
            transaction,
        });

        if (!picture) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Picture not found.',
            });
        }

        // 2. Delete the row first so the DB state is consistent even if
        //    the file unlink fails.
        await picture.destroy({ transaction });

        // 3. Close the gap: any pictures with a position greater than the
        //    deleted one shift down by 1 so positions stay contiguous.
        await UserPicture.decrement('position', {
            by: 1,
            where: {
                user_id: userId,
                position: { [Op.gt]: picture.position },
            },
            transaction,
        });

        await transaction.commit();

        // 4. Best-effort delete of the physical file. Done AFTER commit
        //    on purpose: if the file system delete throws, the DB is
        //    already consistent and the orphan file is a cleanup problem,
        //    not a user-facing one.
        if (picture.path) {
            if (picture.path.includes(cloudFactorPath)) {
                // Option A: Delete from Cloudinary
                try {
                    // Extract public_id from Cloudinary URL (e.g. "folder/filename" before extension)
                    const urlParts = picture.path.split('/');
                    const fileNameWithExt = urlParts.pop(); // "sample.jpg"
                    const folderName = urlParts.pop();      // "user-pictures"
                    const publicId = `${folderName}/${fileNameWithExt.split('.')[0]}`; // "user-pictures/sample"

                    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
                } catch (err) {
                    console.warn(`Cloudinary deletion warning for ${picture.path}:`, err.message);
                    // Don't fail the request — the DB record can still be processed.
                }
            } else {
                // Option B: Delete from local disk (existing code)
                const absolutePath = path.resolve(picture.path);
                try {
                    await fs.promises.unlink(absolutePath);
                } catch (err) {
                    console.warn(`File deletion warning for ${absolutePath}:`, err.message);
                    // Don't fail the request — the DB is already updated.
                }
            }
        }

        // 5. Return the remaining pictures so the frontend can re-render
        const remainingPictures = await UserPicture.findAll({
            where: { user_id: userId },
            order: [['position', 'ASC']],
            attributes: ['id', 'path', 'position'],
        });

        return res.json({
            success: true,
            message: 'Picture deleted.',
            pictures: remainingPictures,
        });
    } catch (error) {
        await transaction.rollback();
        console.error('deletePicture error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete picture.',
            error: error.message,
        });
    }
};

exports.getPremiumStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findByPk(userId, {
            attributes: ['id', 'is_premium', 'premium_expires_at'],
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        const now = new Date();
        const expiresAt = user.premium_expires_at
            ? new Date(user.premium_expires_at)
            : null;

        const isPremium = Boolean(
            user.is_premium &&
            expiresAt &&
            expiresAt > now
        );

        return res.json({
            success: true,
            id: user.id,
            is_premium: isPremium,
        });
    } catch (error) {
        console.error('getPremiumStatus error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch premium status.',
            error: error.message,
        });
    }
};

exports.setupBasicProfile = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: user_id } = req.user;

    let success = false;
    let message = 'User not found.';

    const user = await User.findByPk(user_id);
    if (!user) return res.json({ success, message });

    await user.update(req.body);

    req.body.user_id = user_id;
    await UserProfile.create(req.body);

    // ---- Create default EncountersFilter for this user ----
    // Seed with sensible defaults derived from the profile the user
    // just submitted (interested_in), plus hardcoded fallbacks for the
    // rest. We fall back to the user's own interested_in or EVERYONE.
    const interestedIn = req.body.interested_in || user.interested_in || GENDER.EVERYONE;

    // TODO: When we have enough users, calculate max_age from the user's
    // own age plus 10. For now, hardcode 100 as a safety net.
    //
    // const userAge = calculateAge(user.date_of_birth);
    // const defaultMaxAge = userAge != null ? userAge + 10 : 100;

    const defaultMaxAge = 100;

    await EncountersFilter.create({
        user_id,
        max_distance_km: 200,
        interested_in: interestedIn,
        min_age: 18,
        max_age: defaultMaxAge,
        online_only: false,
        premium_only: false,
    });

    const basic_profile_setup = true;
    await user.update({ basic_profile_setup });

    message = 'Profile Saved.';
    success = true;
    res.status(200).json({ success, message });
};

exports.setupAdvancedProfile = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: user_id } = req.user;
    const { verifiedSelfie, city, country, country_code, latitude, longitude } = req.body;

    let success = false;
    let message = 'User not found.';

    const user = await User.findByPk(user_id);
    if (!user) return res.json({ success, message });

    // 1. Process & Save the Base64 Image
    let savedImagePath = null;

    if (verifiedSelfie) {
        const platform = (process.env.HOSTING_PLATFORM || '').toLowerCase();

        if (platform === 'render') {
            // Option A: Upload directly to Cloudinary
            // Cloudinary's uploader accept Data URIs directly (e.g. data:image/jpeg;base64,...)
            const uploadResult = await cloudinary.uploader.upload(verifiedSelfie, {
                folder: 'crushr/verification-pictures',
                resource_type: 'image'
            });

            // Store Cloudinary's secure URL in DB
            savedImagePath = uploadResult.secure_url;

        } else if (platform === 'vps') {
            // Option B: Save to local disk
            const uploadDir = path.join(__dirname, '../uploads/verification-pictures');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            // Extract binary data from Base64 Data URI
            const base64Data = verifiedSelfie.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            // Generate a unique filename
            const fileName = `selfie-${user_id}-${Date.now()}.jpg`;
            const absolutePath = path.join(uploadDir, fileName);

            // Write image to server disk
            await fs.promises.writeFile(absolutePath, buffer);

            // Relative web path for storage in DB
            savedImagePath = `/uploads/verification-pictures/${fileName}`;

        } else {
            return res.status(500).json({
                success: false,
                message: 'Invalid or missing HOSTING_PLATFORM configuration.'
            });
        }

        // Create record in VerificationPicture table
        await VerificationPicture.create({
            user_id: user.id,
            path: savedImagePath
        });
    }

    // 2. Update User Record
    await user.update({
        city,
        country,
        country_code,
        latitude,
        longitude,
        advanced_profile_setup: true
    });

    message = 'Location and Image saved';
    success = true;
    res.send({ success, message });
}

exports.setupFinalProfile = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    let message = 'No picture uploaded.';
    let success = false;
    const { id: user_id } = req.user;
    const { imagesBody } = req.body;
    const rawFiles = req.files;

    if (!imagesBody || !rawFiles || rawFiles.length === 0) {
        return res.send({ success, message });
    }

    const platform = (process.env.HOSTING_PLATFORM || '').toLowerCase();

    // Normalize imagesBody into an array
    const bodies = Array.isArray(imagesBody) ? imagesBody : [imagesBody];

    for (let i = 0; i < bodies.length; i++) {
        const { position } = JSON.parse(bodies[i]);
        const rawFile = rawFiles[i];

        if (!rawFile) continue;

        let imagePath = null;

        if (platform === 'render') {
            // Option A: Upload memory buffer directly to Cloudinary
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: 'crushr/user-pictures',
                        resource_type: 'image',
                    },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }
                );
                stream.end(rawFile.buffer);
            });

            imagePath = uploadResult.secure_url;

        } else if (platform === 'vps') {
            // Option B: Use Multer's disk storage path
            imagePath = rawFile.path;

        } else {
            return res.status(500).json({
                success: false,
                message: 'Invalid or missing HOSTING_PLATFORM configuration.'
            });
        }

        // Create record in UserPicture table
        await UserPicture.create({
            user_id,
            position,
            path: imagePath
        });

        await User.update(
            { final_profile_setup: true },
            { where: { id: user_id } }
        );
    }

    message = 'Pictures saved';
    success = true;
    res.send({ success, message });
};

exports.completeProfileSetup = async (req, res) => {
    try {
        // Validation handling
        const result = validationResult(req);
        const errors = organizeErrors(result.array());
        if (!result.isEmpty()) return res.send({ errors });

        const userId = req.user.id;
        const {
            bio,
            reason_on_app,
            education,
            relationship_status,
            height_cm,
            smoking,
            drinking
        } = req.body;

        const profilePayload = {
            bio: bio ? bio.trim() : null,
            reason_on_app,
            education,
            relationship_status: relationship_status || 'Single',
            height_cm: height_cm ? parseInt(height_cm, 10) : null,
            smoking: smoking || 'Never',
            drinking: drinking || 'Socially'
        };

        // 1. Explicitly update the user's existing single UserProfile record
        const [updatedRows] = await UserProfile.update(profilePayload, {
            where: { user_id: userId }
        });

        // Fallback: If for any unexpected reason a row wasn't found, ensure one exists
        if (updatedRows === 0) {
            await UserProfile.findOrCreate({
                where: { user_id: userId },
                defaults: {
                    user_id: userId,
                    ...profilePayload
                }
            });
        }

        // 2. Mark profile_page_setup flag as true on the main User model
        await User.update(
            { profile_page_setup: true },
            { where: { id: userId } }
        );

        return res.status(200).json({
            success: true,
            message: 'Profile setup completed successfully!'
        });

    } catch (error) {
        console.error('Error completing profile setup:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to complete profile setup',
            error: error.message
        });
    }
};


exports.getPotentialMatchProfiles = (req, res) => {
    // const userProfiles = [
    //     '/home/joshua/Pictures/EMMA-JOSHUA/8b86896a-9728-401e-b8d5-6e0485525326.jpeg',
    //     '/home/joshua/Pictures/EMMA-JOSHUA/8bd00246-d217-4878-be2e-cc83fc31e773.jpeg',
    //     '/home/joshua/Pictures/EMMA-JOSHUA/9ed1df7f-f2c3-471c-9b22-8a063f3f2d19.jpeg',
    //     '/home/joshua/Pictures/EMMA-JOSHUA/061fb23e-5da8-49b4-8ead-becdeda3978d.jpeg',
    //     '/home/joshua/Pictures/EMMA-JOSHUA/d915a3e8-bd06-4cb9-8196-06e0cefc4392.jpeg',
    //       '/home/joshua/Pictures/EMMA-JOSHUA/',
    //       '/home/joshua/Pictures/EMMA-JOSHUA/',
    // ];

    const userProfiles = [
        {
            id: '0a31f97a-99ce-457e-9ac4-c9a01955bcbd',
            name: 'Emma Korang',
            age: 20,
            distanceFrom: 19,
            pictures: [
                'http://localhost:4000/pictures/8b86896a-9728-401e-b8d5-6e0485525326.jpeg',
                'http://localhost:4000/pictures/dd6eb2bc-787e-4cbf-8d31-637d5159a564.jpeg',
                'http://localhost:4000/pictures/e99fa6c6-296a-4c40-bd1e-fba051d2b280.jpeg',
                'http://localhost:4000/pictures/ea02336a-cd0a-4d35-ab1b-4b49f2451915.jpeg',
            ],
            liked: '3 years',
            seen: true,
        },
        {
            id: '39239e36-4b8f-45ad-8dc9-2cad0fcd9a31',
            name: 'Joshua Gato',
            age: 30,
            distanceFrom: 9,
            pictures: [
                'http://localhost:4000/pictures/061fb23e-5da8-49b4-8ead-becdeda3978d.jpeg',
                'http://localhost:4000/pictures/9ed1df7f-f2c3-471c-9b22-8a063f3f2d19.jpeg',
                'http://localhost:4000/pictures/d915a3e8-bd06-4cb9-8196-06e0cefc4392.jpeg'
            ],
            liked: '1 year',
            seen: true,
        },
        {
            name: 'Joshua Gator',
            age: 38,
            distanceFrom: 90,
            pictures: [
                'http://localhost:4000/pictures/8bd00246-d217-4878-be2e-cc83fc31e773.jpeg',
                'http://localhost:4000/pictures/56ddea63-29c9-42b8-84bb-4c639618ce6c.jpeg',
                'http://localhost:4000/pictures/Image_Editor.png',
                'http://localhost:4000/pictures/IMG_1129.JPG'
            ],
            liked: '5 hours',
            seen: false,
        },
        {
            name: 'Emma Korang',
            age: 20,
            distanceFrom: 19,
            pictures: [
                'http://localhost:4000/pictures/8b86896a-9728-401e-b8d5-6e0485525326.jpeg',
                'http://localhost:4000/pictures/dd6eb2bc-787e-4cbf-8d31-637d5159a564.jpeg',
                'http://localhost:4000/pictures/e99fa6c6-296a-4c40-bd1e-fba051d2b280.jpeg',
                'http://localhost:4000/pictures/ea02336a-cd0a-4d35-ab1b-4b49f2451915.jpeg',
            ],
            liked: '9 days',
            seen: false,
        },
        {
            name: 'Joshua Gato',
            age: 30,
            distanceFrom: 9,
            pictures: [
                'http://localhost:4000/pictures/061fb23e-5da8-49b4-8ead-becdeda3978d.jpeg',
                'http://localhost:4000/pictures/9ed1df7f-f2c3-471c-9b22-8a063f3f2d19.jpeg',
                'http://localhost:4000/pictures/d915a3e8-bd06-4cb9-8196-06e0cefc4392.jpeg'
            ],
            liked: '10 months',
            seen: false,
        },
        {
            name: 'Joshua Gator',
            age: 38,
            distanceFrom: 90,
            pictures: [
                'http://localhost:4000/pictures/8bd00246-d217-4878-be2e-cc83fc31e773.jpeg',
                'http://localhost:4000/pictures/56ddea63-29c9-42b8-84bb-4c639618ce6c.jpeg',
                'http://localhost:4000/pictures/Image_Editor.png',
                'http://localhost:4000/pictures/IMG_1129.JPG'
            ],
            liked: '6 weeks',
            seen: false,
        },
        {
            name: 'Emma Korang',
            age: 20,
            distanceFrom: 19,
            pictures: [
                'http://localhost:4000/pictures/8b86896a-9728-401e-b8d5-6e0485525326.jpeg',
                'http://localhost:4000/pictures/dd6eb2bc-787e-4cbf-8d31-637d5159a564.jpeg',
                'http://localhost:4000/pictures/e99fa6c6-296a-4c40-bd1e-fba051d2b280.jpeg',
                'http://localhost:4000/pictures/ea02336a-cd0a-4d35-ab1b-4b49f2451915.jpeg',
            ],
            liked: '1 week',
            seen: false,
        },
        {
            name: 'Joshua Gato',
            age: 30,
            distanceFrom: 9,
            pictures: [
                'http://localhost:4000/pictures/061fb23e-5da8-49b4-8ead-becdeda3978d.jpeg',
                'http://localhost:4000/pictures/9ed1df7f-f2c3-471c-9b22-8a063f3f2d19.jpeg',
                'http://localhost:4000/pictures/d915a3e8-bd06-4cb9-8196-06e0cefc4392.jpeg'
            ],
            liked: '10 days',
            seen: false,
        },
        {
            name: 'Joshua Gator',
            age: 38,
            distanceFrom: 90,
            pictures: [
                'http://localhost:4000/pictures/8bd00246-d217-4878-be2e-cc83fc31e773.jpeg',
                'http://localhost:4000/pictures/56ddea63-29c9-42b8-84bb-4c639618ce6c.jpeg',
                'http://localhost:4000/pictures/Image_Editor.png',
                'http://localhost:4000/pictures/IMG_1129.JPG'
            ],
            liked: '4 hours',
            seen: false,
        },
        {
            name: 'Emma Korang',
            age: 20,
            distanceFrom: 19,
            pictures: [
                'http://localhost:4000/pictures/8b86896a-9728-401e-b8d5-6e0485525326.jpeg',
                'http://localhost:4000/pictures/dd6eb2bc-787e-4cbf-8d31-637d5159a564.jpeg',
                'http://localhost:4000/pictures/e99fa6c6-296a-4c40-bd1e-fba051d2b280.jpeg',
                'http://localhost:4000/pictures/ea02336a-cd0a-4d35-ab1b-4b49f2451915.jpeg',
            ],
            liked: '20 minutes',
            seen: false,
        },
        {
            name: 'Joshua Gato',
            age: 30,
            distanceFrom: 9,
            pictures: [
                'http://localhost:4000/pictures/061fb23e-5da8-49b4-8ead-becdeda3978d.jpeg',
                'http://localhost:4000/pictures/9ed1df7f-f2c3-471c-9b22-8a063f3f2d19.jpeg',
                'http://localhost:4000/pictures/d915a3e8-bd06-4cb9-8196-06e0cefc4392.jpeg'
            ],
            liked: '1 day',
            seen: false,
        },
        {
            name: 'Joshua Gator',
            age: 38,
            distanceFrom: 90,
            pictures: [
                'http://localhost:4000/pictures/8bd00246-d217-4878-be2e-cc83fc31e773.jpeg',
                'http://localhost:4000/pictures/56ddea63-29c9-42b8-84bb-4c639618ce6c.jpeg',
                'http://localhost:4000/pictures/Image_Editor.png',
                'http://localhost:4000/pictures/IMG_1129.JPG'
            ],
            liked: '16 days',
            seen: false,
        }
        // 'http://localhost:4000/pictures/061fb23e-5da8-49b4-8ead-becdeda3978d.jpeg',
        // 'http://localhost:4000/pictures/8b86896a-9728-401e-b8d5-6e0485525326.jpeg',
        // 'http://localhost:4000/pictures/8bd00246-d217-4878-be2e-cc83fc31e773.jpeg',
        // 'http://localhost:4000/pictures/9ed1df7f-f2c3-471c-9b22-8a063f3f2d19.jpeg',
        // 'http://localhost:4000/pictures/d915a3e8-bd06-4cb9-8196-06e0cefc4392.jpeg',
    ];

    let sucess = true
    let unseen = true;

    res.json({ sucess, unseen, userProfiles, });
}

exports.getVerificationSelfie = async (req, res) => {
    const { id: user_id } = req.user;

    try {
        const verificationPicture = await VerificationPicture.findOne({
            where: { user_id },
            attributes: ['path']
        });

        if (!verificationPicture) {
            return res.status(404).json({
                success: false,
                message: 'Verification selfie not found'
            });
        }

        const platform = (process.env.HOSTING_PLATFORM || '').toLowerCase();
        let base64Image = '';

        if (verificationPicture.path.includes(cloudFactorPath)) {
            // Option A: Read from Cloudinary URL saved in verificationPicture.path
            const imageUrl = verificationPicture.path;

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer'
            });

            base64Image = Buffer.from(response.data, 'binary').toString('base64');

        } else if (!verificationPicture.path.includes(cloudFactorPath)) {
            // Option B: Read from local file system (existing code)
            const filePath = path.join(__dirname, '..', verificationPicture.path);
            const imageBuffer = await fs.promises.readFile(filePath);
            base64Image = imageBuffer.toString('base64');

        } else {
            return res.status(500).json({
                success: false,
                message: 'Invalid or missing HOSTING_PLATFORM configuration.'
            });
        }

        res.json({
            success: true,
            data: {
                base64: `data:image/jpeg;base64,${base64Image}`,
                path: verificationPicture.path
            }
        });
    } catch (error) {
        console.error('Error fetching verification selfie:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching verification selfie',
            error: error.message
        });
    }
};