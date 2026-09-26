const { mailtrapClient } = require('../mailtrap');
const { transporter } = require('../nodemailer');
const { prepareEmailVerificationTemplate } = require('../templates/email-verification');

const sendEmailVerificationMail = (recipientEmail, verificationCode) => {

    const sender = {
        email: "elimellabs@gmail.com",
        name: "Elimel Labs",
    };

    const recipients = [
        {
            email: recipientEmail,
        }
    ];

    const options = {
        from: '"Elimel Labs" <elimellabs@gmail.com>' || sender,
        to: recipientEmail || recipients,
        subject: `${verificationCode} is your verification code`,
        text: `Your 4-digit verification code is: ${verificationCode}`,
        html: prepareEmailVerificationTemplate(verificationCode),
        category: "Account Verification",
    };

    console.log({ options, recipientEmail })

    // mailtrapClient
    //     .send(options)
    //     .then(console.log, console.error);

    transporter.sendMail(options).then(console.log, console.error);
};

module.exports = { sendEmailVerificationMail };