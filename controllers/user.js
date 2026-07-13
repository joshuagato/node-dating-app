const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');

const { sendEmailVerificationMail } = require('../mailer/senders/email-verification');
const { generateVerificationCode, generateTokenForUserId, generateCookiesForToken, 
    organizeErrors, deleteUserFields, updateUserEmailVerificationAndExpiration,
    checkForVerificationCodeExpiry, updateUserPasswordResetConfirmationAndExpiration,
    formatPasswordChangedString, calculateDaysDifference, checkForChangedPasswordInThePast
} = require('../utils/functions');

const User = require('../models/User');
const EmailVerificationAttempt = require('../models/EmailVerificationAttempt');
const PasswordResetAttempt = require('../models/PasswordResetAttempt');
const PasswordReset = require('../models/PasswordReset');
const UserProfile = require('../models/UserProfile');

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
    const { first_name, last_name } = matchedData(req)
    
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