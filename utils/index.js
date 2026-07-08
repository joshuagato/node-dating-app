const crypto = require('crypto');
const { createSigner } = require('fast-jwt');

const generateVerificationCode = digits => {
    // Generate a secure random integer between 0 and 9999
    const code = crypto.randomInt(0, 10000);
    
    // Ensure it is always 4 digits long by padding with leading zeros if needed
    return code.toString().padStart(digits, '0');
};

const generateTokenForUserId = id => {
    const key = process.env.JWT_KEY;
    const signSync = createSigner({ key });
    const token = signSync({ id });
    return token;
}

const generateCookiesForToken = (res, token) => {
    res.cookie('token', token, {
        maxAge: (24 * 60 * 60 * 1000) * 30,     // 30 days,
        httpOnly: false,                        // Prevents client-side JS access (XSS protection)
        secure: false,                          // Forces cookie to be sent over HTTPS only
        sameSite: 'strict'                      // Mitigates CSRF attacks
    });
}

const organizeErrors = errorsArray => {
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

const deleteUserFields = user => {
    delete user.dataValues.id;
    delete user.dataValues.createdAt;
    delete user.dataValues.updatedAt;
    delete user.dataValues.email_verified;
    delete user.dataValues.verification_code;
    return user;
}

const updateUserEmailVerificationAndExpiration = async (user, verificationCode) => {
    console.log('updateUserEmailVerificationAndExpiration')
    user.email_verification_code = verificationCode;
    user.email_verification_code_expiration = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    console.log(new Date(Date.now() + 24 * 60 * 60 * 1000))
}

const checkForVerificationCodeExpiry = email_verification_code_expiration => {
    return Date.now() <= new Date(email_verification_code_expiration);
}

module.exports = { generateVerificationCode, generateTokenForUserId, generateCookiesForToken, 
    organizeErrors, deleteUserFields, updateUserEmailVerificationAndExpiration,
    checkForVerificationCodeExpiry };