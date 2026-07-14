const crypto = require('crypto');
const { createSigner } = require('fast-jwt');
const bcrypt = require('bcryptjs');

const { TWENTY_FOUR_HOURS_FROM_NOW } = require('./constants');

const EmailVerificationRequest = require('../models/EmailVerificationRequest');
const PasswordResetRequest = require('../models/PasswordResetRequest');

exports.generateEmailVerificationCode = digits => {
    const code = crypto.randomInt(0, 10000);
    return code.toString().padStart(digits, '0');
};

exports.generatePasswordResetVerificationCode = digits => {
    const code = crypto.randomInt(0, 1000000);
    return code.toString().padStart(digits, '0');
};

exports.generateTokenForUserId = id => {
    const key = process.env.JWT_KEY;
    const signSync = createSigner({ key });
    const token = signSync({ id });
    return token;
}

exports.generateCookiesForToken = (res, token) => {
    res.cookie('token', token, {
        maxAge: (24 * 60 * 60 * 1000) * 30,     // 30 days,
        httpOnly: false,                        // Prevents client-side JS access (XSS protection)
        secure: false,                          // Forces cookie to be sent over HTTPS only
        sameSite: 'strict'                      // Mitigates CSRF attacks
    });
}

exports.organizeErrors = errorsArray => {
    const errorsData = {};

    errorsArray.forEach(error => {
        if (Object.keys(errorsData).includes(error['path'])) {
            // errorsData[error['path']].push(error['msg']);
            errorsData[error['path']] = [...errorsData[error['path']], error['msg']];
        } else {
            errorsData[error['path']] = [error['msg']];
        }
    })

    return errorsData;
}

exports.deleteUserFields = user => {
    delete user.dataValues.id;
    delete user.dataValues.createdAt;
    delete user.dataValues.updatedAt;
    delete user.dataValues.email_verified;
    delete user.dataValues.verification_code;
    return user;
}

exports.updateUserEmailVerificationAndExpiration = async (user, verificationCode) => {
    user.email_verification_code = verificationCode;
    user.email_verification_code_expiration = TWENTY_FOUR_HOURS_FROM_NOW;
    await user.save();
}

exports.updateUserPasswordResetConfirmationAndExpiration = async (user, confirmationCode) => {
    user.password_reset_code = confirmationCode;
    user.password_reset_code_expiration = TWENTY_FOUR_HOURS_FROM_NOW;
    await user.save();
}

exports.setUserEmailVerificationRequest = async data => await EmailVerificationRequest.create(data);

exports.setUserPasswordResetRequest = async data => await PasswordResetRequest.create(data);

exports.checkForVerificationCodeExpiry = email_verification_code_expiration => {
    return Date.now() > new Date(email_verification_code_expiration);
}

const formatPasswordChangedString = days => {
    const message = "Entered Password was Changed less than a day ago.";

    const daysformat = days >= 2 ? `${Math.floor(days)} days` : 'a day';
    if (days < 1) return message;

    return `Entered Password was Changed ${daysformat} ago`;
}

const calculateDaysDifference = date => {
    const oneDay = 24 * 60 * 60 * 1000;
    const difference = new Date(Date.now()) - new Date(date);
    const daysDifference = difference / oneDay;
    return daysDifference;
}

exports.checkForChangedPasswordInThePast = async (userPasswordResets, password) => {
    let nextRecordAfterMatched = false;
    let message = '';

    for (const [index, userPasswordReset] of userPasswordResets.entries()) {
        let days;

        if (nextRecordAfterMatched) {
            days = calculateDaysDifference(userPasswordReset.createdAt);
            message = formatPasswordChangedString(days);
            break;
        }

        const passwordMatch = await bcrypt.compare(password, userPasswordReset.password);
        
        if (passwordMatch)
            nextRecordAfterMatched = true;
    }
    
    return message;
}

exports.formatPasswordChangedString = formatPasswordChangedString;
exports.calculateDaysDifference = calculateDaysDifference;