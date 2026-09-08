const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');
const { Sequelize, Op } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const { organizeErrors, deleteUserFields, getRawFile } = require('../utils/functions');
const { GENDER } = require('../utils/constants');

const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserPicture = require('../models/UserPicture');
const VerificationPicture = require('../models/VerificationPicture');

// User -> UserProfile Associations
User.hasOne(UserProfile, { foreignKey: 'user_id', as: 'profile' });
UserProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user_profile' });


// User -> UserPicture Associations
User.hasMany(UserPicture, { foreignKey: 'user_id', as: 'pictures' });
UserPicture.belongsTo(User, { foreignKey: 'user_id', as: 'user_picture' });



exports.getProfile = async (req, res) => {
    const userId = req.user.id; // Assumes auth middleware populates req.user

    // Fetch User with associated Profile and Pictures in parallel queries or single eager load
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
            'longitude',
            'latitude'
        ],
        include: [
            {
                model: UserProfile,
                as: 'profile', // Adjust association alias if defined in models/index.js
                attributes: ['first_name_on', 'last_name_on', 'other_names_on', 'gender_on']
            },
            {
                model: UserPicture,
                as: 'pictures', // Adjust association alias if defined in models/index.js
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
            message: 'User profile not found.'
        });
    }

    // Format and fallback values to cleanly feed your React component state
    const responseData = {
        user: {
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            other_names: user.other_names || '',
            gender: user.gender || GENDER.MAN,
            interested_in: user.interested_in || GENDER.WOMEN,
            date_of_birth: user.date_of_birth || '',
            country: user.country || '',
            city: user.city || '',
            longitude: user.longitude !== null ? String(user.longitude) : '',
            latitude: user.latitude !== null ? String(user.latitude) : ''
        },
        profileVisibility: user.profileVisibility || {
            first_name_on: true,
            last_name_on: false,
            other_names_on: false,
            gender_on: true
        },
        pictures: user.pictures || []
    };

    return res.send({
        success: true,
        data: responseData
    });
}

exports.updateProfile = async (req, res) => {
    const transaction = await postgresSequelize.transaction();

    try {
        const userId = req.user.id;

        // Parse JSON payloads sent via FormData
        const userData = typeof req.body.user === 'string' ? JSON.parse(req.body.user) : req.body.user;
        const visibilityData = typeof req.body.visibility === 'string' ? JSON.parse(req.body.visibility) : req.body.visibility;
        const pictureMeta = typeof req.body.pictureMeta === 'string' ? JSON.parse(req.body.pictureMeta) : (req.body.pictureMeta || []);
        const deletedPictureIds = typeof req.body.deletedPictureIds === 'string' ? JSON.parse(req.body.deletedPictureIds) : (req.body.deletedPictureIds || []);

        /* -------------------------------------------------------------------------- */
        /* 1. UPDATE USER DETAILS                                                    */
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
                city: userData.city,
                latitude: userData.latitude,
                longitude: userData.longitude
            }, {
                where: { id: userId },
                transaction
            });
        }

        /* -------------------------------------------------------------------------- */
        /* 2. UPDATE USER PROFILE (VISIBILITY / PREFERENCES)                         */
        /* -------------------------------------------------------------------------- */
        if (visibilityData) {
            await UserProfile.update({
                last_name_on: Boolean(visibilityData.last_name_on),
                other_names_on: Boolean(visibilityData.other_names_on),
                gender_on: Boolean(visibilityData.gender_on)
            }, {
                where: { user_id: userId },
                transaction
            });
        }

        /* -------------------------------------------------------------------------- */
        /* 3. DELETE REMOVED PICTURES                                               */
        /* -------------------------------------------------------------------------- */
        if (Array.isArray(deletedPictureIds) && deletedPictureIds.length > 0) {
            const picsToDelete = await UserPicture.findAll({
                where: {
                    id: deletedPictureIds,
                    user_id: userId
                },
                transaction
            });

            for (const pic of picsToDelete) {
                if (pic.path) {
                    const absolutePath = path.resolve(pic.path);
                    try {
                        await fs.unlink(absolutePath);
                    } catch (err) {
                        console.warn(`File deletion warning for path ${absolutePath}:`, err.message);
                    }
                }
            }

            await UserPicture.destroy({
                where: {
                    id: deletedPictureIds,
                    user_id: userId
                },
                transaction
            });
        }

        /* -------------------------------------------------------------------------- */
        /* 4. REORDER EXISTING PICTURES                                              */
        /* -------------------------------------------------------------------------- */
        for (const meta of pictureMeta) {
            if (meta.dbId) {
                await UserPicture.update(
                    { position: meta.position },
                    {
                        where: {
                            id: meta.dbId,
                            user_id: userId
                        },
                        transaction
                    }
                );
            }
        }

        /* -------------------------------------------------------------------------- */
        /* 5. UPLOAD & INSERT NEW PICTURES                                           */
        /* -------------------------------------------------------------------------- */
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const slotMatch = file.fieldname.match(/picture_slot_(\d+)/);
                const position = slotMatch ? parseInt(slotMatch[1], 10) : null;

                if (position) {
                    const relativePath = path.relative(process.cwd(), file.path).replace(/\\/g, '/');

                    await UserPicture.create({
                        user_id: userId,
                        path: relativePath,  // Changed from image_url to path
                        position: position
                    }, { transaction });
                }
            }
        }

        await transaction.commit();

        // Fetch refreshed user state for client confirmation
        const updatedUser = await User.findByPk(userId, {
            include: [
                { model: UserProfile, as: 'profile' },
                { model: UserPicture, as: 'pictures' }
            ]
        });

        return res.send({
            success: true,
            message: 'Profile updated successfully.',
            data: updatedUser
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Profile update error:', error);

        return res.status(500).send({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
};

exports.setupBasicProfile = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: user_id } = req.user;
    // const { first_name, last_name } = matchedData(req);

    let success = false;
    let message = 'User not found.';

    const user = await User.findByPk(user_id);
    if (!user) return res.json({ success, message });

    await user.update(req.body);

    req.body.user_id = user_id;
    await UserProfile.create(req.body);

    const basic_profile_setup = true;
    await user.update({ basic_profile_setup });

    message = 'Profile Saved.';
    success = true;
    res.status(200).json({ success, message });
}

exports.setupAdvancedProfile = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: user_id } = req.user;
    const { verifiedSelfie, city, country, latitude, longitude } = req.body;

    let success = false;
    let message = 'User not found.';

    const user = await User.findByPk(user_id);
    if (!user) return res.json({ success, message });

    // 1. Process & Save the Base64 Image
    let savedImagePath = null;

    if (verifiedSelfie) {
        // Ensure target upload directory exists
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

    // Normalize imagesBody into an array
    const bodies = Array.isArray(imagesBody) ? imagesBody : [imagesBody];

    // Use a standard for...of loop to handle async database creation cleanly
    for (let i = 0; i < bodies.length; i++) {
        const { position } = JSON.parse(bodies[i]);
        // Get the corresponding uploaded file from Multer's array
        const rawFile = rawFiles[i];

        if (rawFile) {
            await UserPicture.create({
                user_id,
                position,
                path: rawFile.path // Use Multer's auto-generated file path
            });
        }
    }

    message = 'Pictures saved';
    success = true;
    res.send({ success, message });
};

exports.getEncountersProfiles = async (req, res) => {
    const currentUser = req.user;
    // let nearbyUsers = [];
    // const { max_distance } = req.query;

    const { latitude, longitude, id: currentUserId } = currentUser;

    const { max_distance = 11, limit = 20, offset = 0 } = req.query;

    const unfilteredUsers = await User.findAll({
        attributes: [
            'id',
            [
                Sequelize.literal(`
                CONCAT(
                    "User"."first_name",
                    CASE 
                        WHEN "profile"."last_name_on" = TRUE THEN CONCAT(' ', "User"."last_name")
                        ELSE ''
                    END,
                    CASE 
                        WHEN "profile"."other_names_on" = TRUE THEN CONCAT(' ', "User"."other_names")
                        ELSE ''
                    END
                )
            `),
                'name'
            ],
            'gender',
            'city',
            [
                Sequelize.literal(`
                DATE_PART('year', AGE(CURRENT_DATE, "User"."date_of_birth"))::integer
            `),
                'age'
            ],
            [
                Sequelize.literal(`
                    ROUND(
                        (
                            6371 * acos(
                                cos(radians(${latitude}))
                                * cos(radians("User"."latitude"))
                                * cos(radians("User"."longitude") - radians(${longitude}))
                                + sin(radians(${latitude}))
                                * sin(radians("User"."latitude"))
                            )
                        )::numeric, 1
                    )
                `),
                'distance_from'
            ],
            'is_online',
            'last_seen'
        ],
        include: [
            {
                model: UserProfile,
                as: 'profile',
                attributes: [],
                required: false
            },
            {
                model: UserPicture,
                as: 'pictures',
                attributes: ['path', 'position'],
                required: false,
                separate: true,
                order: [['position', 'ASC']]
            }
        ],
        where: {
            // id: { [Sequelize.Op.ne]: currentUserId },
            latitude: { [Sequelize.Op.ne]: null },
            longitude: { [Sequelize.Op.ne]: null },
            [Sequelize.Op.and]: Sequelize.literal(`
                (
                    6371 * acos(
                        cos(radians(${latitude}))
                        * cos(radians("User"."latitude"))
                        * cos(radians("User"."longitude") - radians(${longitude}))
                        + sin(radians(${latitude}))
                        * sin(radians("User"."latitude"))
                    )
                ) <= ${max_distance}
            `)
        },
        order: [
            [Sequelize.literal('distance_from'), 'ASC']
        ],
        limit: parseInt(limit),
        offset: parseInt(offset)
    });

    console.log({ unfilteredUsers })

    const myself = {};
    unfilteredUsers.forEach(user => {
        if (user.id.toString() === currentUserId.toString()) {
            myself.id = user.dataValues.id;
            myself.name = user.dataValues.name;
            myself.picture = user.dataValues.pictures[0].path;
        }
    })

    const users = unfilteredUsers.filter(user => user.id.toString() !== currentUserId.toString());

    let success = true;
    res.send({ success, myself, users });
}

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

        // Read the file and convert to base64
        const filePath = path.join(__dirname, '..', verificationPicture.path);
        // console.log({ filePath })
        const imageBuffer = await fs.promises.readFile(filePath);
        const base64Image = imageBuffer.toString('base64');

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