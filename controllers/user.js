const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');
const { literal } = require('sequelize');

const { sendEmailVerificationMail } = require('../mailer/senders/email-verification');
const { generateVerificationCode, generateTokenForUserId, generateCookiesForToken, 
    organizeErrors, deleteUserFields, updateUserEmailVerificationAndExpiration,
    checkForVerificationCodeExpiry, updateUserPasswordResetConfirmationAndExpiration } = require('../utils/functions');

const User = require('../models/User');
const EmailVerificationAttempt = require('../models/EmailVerificationAttempt');

exports.profile = async (req, res) => {
    const message = 'Profile not found.';
    const user = deleteUserFields(req.user);

    if (!user) return res.status(404).json({ success: false, message });

    res.status(200).json(user);
}

exports.login = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    // const { email, password } = req.body;
    const { email, password } = matchedData(req);
    let success = false;
    let message = 'Email or Password is wrong';
    
    const user = await User.findOne({ where: { email } });
    if (!user) return res.json({ success, message });
    
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) return res.send({ success, message });

    if (!user.email_verified) {
        const verificationCode = generateVerificationCode(4);
        await updateUserEmailVerificationAndExpiration(user, verificationCode);
        // sendEmailVerificationMail(email, verificationCode);

        message = 'Please check your email for confirmation code';
    } else {
        message = 'Logged in successfully';
    }

    const token = generateTokenForUserId(user.id);

    generateCookiesForToken(res, token);

    success = true;
    res.status(200).json({ success, message, token });
}

exports.signup = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    // const { email, password } = req.body;
    const { email, password } = matchedData(req);

    let success = false;
    let message = 'User with this email already exists';
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) return res.send({ success, message });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    req.body.password = hashedPassword;
   
    const user = await User.create(req.body);

    const verificationCode = generateVerificationCode(4);
    await updateUserEmailVerificationAndExpiration(user, verificationCode);
    // sendEmailVerificationMail(email, verificationCode);

    const token = generateTokenForUserId(user.id);

    generateCookiesForToken(res, token);

    success = true;
    message = 'Check your email for verification code';
    res.status(200).json({ success, message, token });
}

exports.verifyEmail = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const totalVerificationAttempts = 3;
    const { id: user_id, email_verification_code, email_verification_code_expiration } = req.user;
    const emailVerificationAttempt = await EmailVerificationAttempt.findAndCountAll({ user_id });

    const remainingAttemps = Number(totalVerificationAttempts - (emailVerificationAttempt.count + 1));

    let exceededLimit = true;
    let success = false;
    
    // const { verification_code, verification_channel } = matchedData(req);
    const { verification_code, verification_channel } = req.body;

    let message = 'Verification code Expired.';
    let verification_code_expired = true;

    const emailVerificationAttempt = await EmailVerificationAttempt.create({ 
        user_id, verification_code, verification_channel,
    });

    // Check if verification_code not expired
    const codeNotExpired = checkForVerificationCodeExpiry(email_verification_code_expiration);
    if (!codeNotExpired) {
        emailVerificationAttempt.verification_code_expired = verification_code_expired;
        emailVerificationAttempt.save()
        return res.send({ success, message });
    }
    
    let verification_code_correct = false;
    verification_code_expired = false;
    emailVerificationAttempt.verification_code_expired = verification_code_expired;

    if (email_verification_code.toString() !== verification_code.toString()) {
        emailVerificationAttempt.verification_code_correct = verification_code_correct;
        await emailVerificationAttempt.save()

        message = 'Too many wrong attempts. Wait for 5 minutes';
        if (remainingAttemps < 1) return res.send({ exceededLimit, success, message });

        exceededLimit = false;
        const attempts = remainingAttemps === 1 ? 'attempt' : 'attempts';
        message = `Wrong verification code. ${remainingAttemps} more ${attempts}`;

        return res.send({ success, message });
    }
    
    verification_code_correct = true;
    emailVerificationAttempt.verification_code_correct = verification_code_correct;
    await emailVerificationAttempt.save();
    
    const userData = await User.findByPk(user_id);
    const email_verified = true;
    await userData.update({ email_verified });
    await userData.save();

    success = true;
    message = 'Email verification successful.';
    res.send({ success, message });
}

exports.requestPasswordReset = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { email } = matchedData(req);
    const user = req.user;

    const userData = await User.findOne({ where: { email } });

    let message = 'Email not Found! Enter the email You used to Sign Up.'
    let success = false;
    if (!userData) return res.send({ success, message });
    
    const confirmationCode = generateVerificationCode(6);
    await updateUserPasswordResetConfirmationAndExpiration(user, confirmationCode);

    message = 'Kindly Check Your Email Inbox/Junk/Spam for Confirmation Code.'
    success = true;
    res.send({ success, message });
}