const { mailtrapClient } = require('../mailtrap'); 
const { prepareEmailVerificationTemplate } = require('../templates/email-verification');

const sendEmailVerificationMail = (recipientEmail, verificationCode) => {
    console.log('sendEmailVerificationMail');
    

    const sender = {
        email: "noreply@streammatch.com",
        name: "Stream Match",
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