const { body } = require('express-validator');

const validateEmail = () => body('email').trim().notEmpty().withMessage('Email cannot be empty').isEmail().withMessage('Enter a valid email address');

const validatePassword = () => body('password').trim().notEmpty().withMessage('Password cannot be empty').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long');

const validateConfirmPassword = () => body('passwordConfirmation').trim().notEmpty().withMessage('Password confirmation cannot be empty').custom((value, { req }) => {
    return value === req.body.password;
}).withMessage('Password confirmation must match with Password');


module.exports = { validateEmail, validatePassword, validateConfirmPassword };