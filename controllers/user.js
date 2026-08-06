const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');

const { organizeErrors, deleteUserFields, getRawFile } = require('../utils/functions');

const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserPicture = require('../models/UserPicture');

exports.getProfile = async (req, res) => {
    const message = 'Profile not found.';
    const user = deleteUserFields(req.user);

    if (!user) return res.status(404).json({ success: false, message });

    res.status(200).json(user);
}

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

    message = 'No picture uploaded.';
    success = false;
    const { id: user_id } = req.user;
    const { imagesBody } = req.body;
    const rawFiles = req.files;
    // const data = matchedData(req);

    if (!imagesBody || rawFiles.length === 0) return res.send({ success, message });

    if (typeof imagesBody !== 'string') {
        imagesBody.sort((a, b) => JSON.parse(a).position - JSON.parse(b).position);

        imagesBody.forEach(async element => {
            const { position, file } = JSON.parse(element);

            // const extractFileNameFromPath = path => path.substring();

            const { path } = getRawFile(rawFiles, file);

            await UserPicture.create({ user_id, position, path });
        });
    } else {
        const { position, file } = JSON.parse(imagesBody);

        const { path } = getRawFile(rawFiles, file);

        await UserPicture.create({ user_id, position, path });
    }

    message = 'Pictures saved';
    success = true;
    res.send({ success, message });
}

exports.setupFinalProfile = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: user_id } = req.user;

    let success = false;
    let message = 'User not found.';

    const user = await User.findByPk(user_id);
    if (!user) return res.json({ success, message });

    req.body.final_profile_setup = true;
    await user.update(req.body);

    message = 'Location saved';
    success = true;
    res.send({ success, message });
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
            name: 'Emma Korang',
            age: 20,
            distanceFrom: 19,
            pictures: [
                'http://localhost:4000/pictures/8b86896a-9728-401e-b8d5-6e0485525326.jpeg',
                'http://localhost:4000/pictures/dd6eb2bc-787e-4cbf-8d31-637d5159a564.jpeg',
                'http://localhost:4000/pictures/e99fa6c6-296a-4c40-bd1e-fba051d2b280.jpeg',
                'http://localhost:4000/pictures/ea02336a-cd0a-4d35-ab1b-4b49f2451915.jpeg',
            ],
            liked: '3 years'
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
            liked: '1 year'
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
            liked: '5 hours'
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
            liked: '9 days'
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
            liked: '10 months'
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
            liked: '6 weeks'
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
            liked: '1 week'
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
            liked: '10 days'
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
            liked: '4 hours'
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
            liked: '20 minutes'
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
            liked: '1 day'
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
            liked: '16 days'
        }
        // 'http://localhost:4000/pictures/061fb23e-5da8-49b4-8ead-becdeda3978d.jpeg',
        // 'http://localhost:4000/pictures/8b86896a-9728-401e-b8d5-6e0485525326.jpeg',
        // 'http://localhost:4000/pictures/8bd00246-d217-4878-be2e-cc83fc31e773.jpeg',
        // 'http://localhost:4000/pictures/9ed1df7f-f2c3-471c-9b22-8a063f3f2d19.jpeg',
        // 'http://localhost:4000/pictures/d915a3e8-bd06-4cb9-8196-06e0cefc4392.jpeg',
    ];

    res.json({ sucess: true, userProfiles });
}