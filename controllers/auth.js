const bcrypt = require('bcryptjs');
const { validationResult, matchedData } = require('express-validator');
const { literal, Op } = require('sequelize');

const { sendEmailVerificationMail } = require('../mailer/senders/email-verification');
const { generateEmailVerificationCode, generatePasswordResetVerificationCode, generateTokenForUserId, 
    generateCookiesForToken, organizeErrors, deleteUserFields, checkForVerificationCodeExpiry,
    checkForChangedPasswordInThePast, setUserEmailVerificationRequest, setUserPasswordResetRequest
} = require('../utils/functions');
const { TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW } = require('../utils/constants');

const User = require('../models/User');
const EmailVerificationRequest = require('../models/EmailVerificationRequest');
const EmailVerificationAttempt = require('../models/EmailVerificationAttempt');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const PasswordResetVerificationAttempt = require('../models/PasswordResetVerificationAttempt');
const PasswordReset = require('../models/PasswordReset');

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

    const { id: user_id } = user;
    
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
        userPasswordResets = await PasswordReset.findAll({ where: { user_id }, order: [['createdAt', 'ASC']] });
    
        const response = await checkForChangedPasswordInThePast(userPasswordResets, password);
        if (response) return res.send({ success, message: response });

        return res.send({ success, message });        
    }
        
    if (!user.email_verified) {
        const verificationCode = generateEmailVerificationCode(4);
        
        const verificationRequestData = {
            user_id: user.id, email_verification_code: verificationCode, 
            email_verification_code_expiration: TWENTY_FOUR_HOURS_FROM_NOW
        };

        await setUserEmailVerificationRequest(verificationRequestData);
        // sendEmailVerificationMail(email, verificationCode);

        message = 'Please check your email for confirmation code';
    } else {
        message = 'Logged in successfully';
    }

    const token = generateTokenForUserId(user.id);

    generateCookiesForToken(res, token);

    success = true;
    const basic_profile_setup = user.basic_profile_setup;
    const email_verified = user.email_verified;
    const advanced_profile_setup = user.advanced_profile_setup;
    res.status(200).json({ success, message, token, email_verified, basic_profile_setup, advanced_profile_setup });
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

    const verificationCode = generateEmailVerificationCode(4);

    const verificationRequestData = { 
        user_id: user.id, email_verification_code: verificationCode, 
        email_verification_code_expiration: TWENTY_FOUR_HOURS_FROM_NOW
    };

    await setUserEmailVerificationRequest(verificationRequestData);
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

    const { id: user_id } = req.user;
    let success = false;
    
    // const { verification_code, verification_channel } = matchedData(req);
    const { verification_code: verification_code_entered, verification_channel } = req.body;

    const emailVerificationRequest = await EmailVerificationRequest.findOne({ 
        where: { user_id, createdAt: { [Op.gt]: TWENTY_FOUR_HOURS_BEFORE_NOW } }, order: [['createdAt', 'DESC']] });
    
    const { id: email_verification_request_id, email_verification_code, email_verification_code_expiration } = emailVerificationRequest;
    
    const emailVerificationAttempt = await EmailVerificationAttempt.create({ 
        user_id, email_verification_request_id, verification_code_entered, verification_channel,
    });

    let message = 'Verification code Expired.';
    let verification_code_expired = true;
    // Check if verification_code not expired
    const codeExpired = checkForVerificationCodeExpiry(email_verification_code_expiration);
    if (codeExpired) {
        emailVerificationAttempt.verification_code_expired = verification_code_expired;
        emailVerificationAttempt.save()
        return res.send({ success, message });
    }

    const totalVerificationAttempts = 3;
    let verification_code_correct = false;

    let exceededLimit = true;
    verification_code_expired = false;
    emailVerificationAttempt.verification_code_expired = verification_code_expired;

    if (email_verification_code.toString() !== verification_code_entered.toString()) {

        emailVerificationAttempt.verification_code_correct = verification_code_correct;
        await emailVerificationAttempt.save();

        const userEmailVerificationAttempt = await EmailVerificationAttempt.findAndCountAll({ 
            where: { user_id, email_verification_request_id, verification_code_correct },
        });

        const remainingAttemps = Number(totalVerificationAttempts - userEmailVerificationAttempt.count);

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
    // const user = req.user;

    const userData = await User.findOne({ where: { email } });

    let message = 'Email not Found! Enter the email You used to Sign Up.'
    let success = false;
    if (!userData) return res.send({ success, message });
    
    const confirmationCode = generatePasswordResetVerificationCode(6);
    const passwordResetRequestData = { 
        user_id: userData.id, password_reset_code: confirmationCode, 
        password_reset_code_expiration: TWENTY_FOUR_HOURS_FROM_NOW
    };

    await setUserPasswordResetRequest(passwordResetRequestData);
    // sendEmailVerificationMail(email, confirmationCode);

    const token = generateTokenForUserId(userData.id);

    generateCookiesForToken(res, token);

    message = 'Kindly Check Your Email Inbox/Junk/Spam for Confirmation Code.';
    success = true;
    res.send({ success, message });
}

exports.confirmPasswordReset = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    const { id: user_id } = req.user;
    let success = false;
    
    // const { verification_code } = matchedData(req);
    const { verification_code: verification_code_entered } = req.body;

    let message = 'Verification code Expired.';
    let verification_code_expired = true;

    const passwordResetRequest = await PasswordResetRequest.findOne({ 
        where: { user_id, createdAt: { [Op.gt]: TWENTY_FOUR_HOURS_BEFORE_NOW } }, order: [['createdAt', 'DESC']] });
    
    const { id: password_reset_request_id, password_reset_code, password_reset_code_expiration } = passwordResetRequest;

    const passwordResetVerificationAttempt = await PasswordResetVerificationAttempt.create({ 
        user_id, password_reset_request_id, verification_code_entered, 
    });

    // Check if verification_code not expired
    const codeExpired = checkForVerificationCodeExpiry(password_reset_code_expiration);
    if (codeExpired) {
        passwordResetVerificationAttempt.verification_code_expired = verification_code_expired;
        passwordResetVerificationAttempt.save();
        return res.send({ success, message });
    }

    const totalVerificationAttempts = 3;
    let exceededLimit = true;
    
    let verification_code_correct = false;
    verification_code_expired = false;
    passwordResetVerificationAttempt.verification_code_expired = verification_code_expired;

    if (password_reset_code.toString() !== verification_code_entered.toString()) {
        passwordResetVerificationAttempt.verification_code_correct = verification_code_correct;
        await passwordResetVerificationAttempt.save();

        const userPasswordResetVerificationAttempt = await PasswordResetVerificationAttempt.findAndCountAll({ 
            where: { user_id, password_reset_request_id, verification_code_correct }, 
        });

        const remainingAttemps = Number(totalVerificationAttempts - userPasswordResetVerificationAttempt.count);

        message = 'Too many wrong attempts. Wait for 5 minutes';
        if (remainingAttemps < 1) return res.send({ exceededLimit, success, message });

        exceededLimit = false;
        const attempts = remainingAttemps === 1 ? 'attempt' : 'attempts';
        message = `Wrong verification code. ${remainingAttemps} more ${attempts}`;

        return res.send({ success, message });
    }
    
    verification_code_correct = true;
    passwordResetVerificationAttempt.verification_code_correct = verification_code_correct;
    await passwordResetVerificationAttempt.save();

    success = true;
    message = 'Password reset Email verification successful.';
    res.send({ success, message });
}

exports.resetPassword = async (req, res) => {
    const result = validationResult(req);
    const errors = organizeErrors(result.array());
    if (!result.isEmpty()) return res.send({ errors });

    let { password } = matchedData(req);
    const { id: user_id } = req.user;

    const userData = await User.findByPk(user_id);

    let message = 'User not Found!';
    let success = false;
    if (!userData) return res.send({ success, message });
    
    // Password Stuff
    message = "You entered your Current Password. Please, enter a New One!"
    const passwordMatch = await bcrypt.compare(password, userData.password);
    if (passwordMatch) return res.send({ success, message });

    userPasswordResets = await PasswordReset.findAll({ where: { user_id }, order: [['createdAt', 'ASC']] });
    
    message = await checkForChangedPasswordInThePast(userPasswordResets, password);
    if (message) return res.send({ success, message });

    const salt = await bcrypt.genSalt(10);
    password = await bcrypt.hash(password, salt);

    await userData.update({ password });
    await PasswordReset.create({ user_id, password });

    message = 'Password Reset Successful.';
    success = true;
    res.send({ success, message });
}