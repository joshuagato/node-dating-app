const { body } = require('express-validator');
const { capitalize } = require('../utils/functions');

const validateEmail = () => body('email').trim().notEmpty().withMessage('Email cannot be empty').isEmail().withMessage('Enter a valid email address');

const validateChatMessage = fieldName => body(fieldName).trim().notEmpty().withMessage(`${capitalize(fieldName)} cannot be empty`);

const validatePictures = () => body('imagesBody').trim().notEmpty().withMessage('You must upload at least 2 Pictures');

const validateName = fieldName => body(fieldName).trim().notEmpty().withMessage(`${capitalize(fieldName)} cannot be empty`);

const validateLocation = fieldName => body(fieldName).trim().notEmpty().withMessage(`${capitalize(fieldName)} cannot be empty`);

const validateCoordinates = fieldName => body(fieldName).isDecimal().withMessage(`${capitalize(fieldName)} cannot be empty`);

const validateSelfie = () => body('verifiedSelfie').trim().notEmpty().withMessage('Selfie image is required.');

const validateCode = (fieldName, length) => body(fieldName).trim().notEmpty().withMessage('Code cannot be empty').isLength({ min: length, max: length }).withMessage(`Code must be at least ${length} characters long`);

const validatePassword = () => body('password').trim().notEmpty().withMessage('Password cannot be empty').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long');

const validateConfirmPassword = () => body('passwordConfirmation').trim().notEmpty().withMessage('Password confirmation cannot be empty').custom((value, { req }) => {
    return value === req.body.password;
}).withMessage('Password confirmation must match with Password');

const profileSetupValidation = [
    body('bio')
        .notEmpty().withMessage('About me section is required')
        .isString().withMessage('Bio must be a string')
        .isLength({ min: 10, max: 300 }).withMessage('Bio must be between 10 and 300 characters'),

    body('reason_on_app')
        .notEmpty().withMessage('Please select your reason for using the app')
        .isIn([
            'Long-term relationship',
            'Casual dating',
            'Hook Up',
            'New friends',
            'Marriage',
            'Not sure yet'
        ]).withMessage('Invalid option selected for app reason'),

    body('education')
        .notEmpty().withMessage('Education level is required')
        .isIn([
            'High School',
            'Undergraduate Degree',
            'Postgraduate Degree',
            'Doctorate / PhD',
            'Trade / Vocational School',
            'Prefer not to say'
        ]).withMessage('Invalid option selected for education'),

    body('relationship_status')
        .optional({ checkFalsy: true })
        .isIn(['Single', 'Divorced', 'Widowed', 'Separated'])
        .withMessage('Invalid relationship status'),

    body('height_cm')
        .optional({ checkFalsy: true })
        .isInt({ min: 50, max: 250 })
        .withMessage('Height must be a valid number in cm (between 50 and 250)'),

    body('smoking')
        .optional({ checkFalsy: true })
        .isIn(['Never', 'Socially', 'Regularly'])
        .withMessage('Invalid option for smoking'),

    body('drinking')
        .optional({ checkFalsy: true })
        .isIn(['Never', 'Socially', 'Regularly'])
        .withMessage('Invalid option for drinking')
];


module.exports = {
    validateEmail, validatePassword, validateConfirmPassword, validateName, validateCode,
    validateLocation, validateCoordinates, validateChatMessage, validateSelfie, profileSetupValidation
};