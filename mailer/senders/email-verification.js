const { mailtrapClient } = require('../mailtrap');
const { prepareEmailVerificationTemplate } = require('../templates/email-verification');

const sendEmailVerificationMail = (recipientEmail, verificationCode) => {

    const sender = {
        email: "noreply@crushr.com",
        name: "Crushr Dating",
    };

    const recipients = [
        {
            email: recipientEmail,
        }
    ];

    mailtrapClient
        .send({
            from: sender,
            to: recipients,
            subject: `${verificationCode} is your verification code`,
            text: `Your 4-digit verification code is: ${verificationCode}`,
            html: prepareEmailVerificationTemplate(verificationCode),
            category: "Account Verification",
        })
        .then(console.log, console.error);
};

module.exports = { sendEmailVerificationMail };