const { mailtrapClient } = require('../mailtrap');
const { transporter } = require('../nodemailer');
const { sendVerificationEmail } = require('../brevo');
const { sendMailJetEmail } = require('../mailjet');
const { prepareEmailVerificationTemplate } = require('../templates/email-verification');

const sendEmailVerificationMail = async (recipientEmail, verificationCode) => {

    const from = {
        Email: "elimellabs@gmail.com",
        Name: "Elimel Labs",
    }

    const to = {
        Email: recipientEmail,
        Name: '',
    }

    const mailjetOptions = {
        from,
        to,
        subject: `${verificationCode} is your verification code`,
        text: `Your 4-digit verification code is: ${verificationCode}`,
        html: prepareEmailVerificationTemplate(verificationCode),
    }

    sendMailJetEmail(mailjetOptions);


    const sender = {
        email: "elimellabs@gmail.com",
        name: "Elimel Labs",
    };

    const recipients = [
        {
            email: recipientEmail,
        }
    ];


    // const mailtrapOptions = {
    //     from: sender,
    //     to: recipients,
    //     subject: `${verificationCode} is your verification code`,
    //     text: `Your 4-digit verification code is: ${verificationCode}`,
    //     html: prepareEmailVerificationTemplate(verificationCode),
    //     category: "Account Verification",
    // };

    // mailtrapClient
    //     .send(mailtrapOptions)
    //     .then(console.log, console.error);

    // const nodeMailerOptions = {
    //     from: '"Elimel Labs" <elimellabs@gmail.com>',
    //     to: recipientEmail,
    //     subject: `${verificationCode} is your verification code`,
    //     text: `Your 4-digit verification code is: ${verificationCode}`,
    //     html: prepareEmailVerificationTemplate(verificationCode),
    //     category: "Account Verification",
    // };

    // transporter.sendMail(nodeMailerOptions).then(console.log, console.error);


    // const brevoOptions = {
    //     sender,
    //     to: recipients,
    //     subject: `${verificationCode} is your verification code`,
    //     text: `Your 4-digit verification code is: ${verificationCode}`,
    //     htmlContent: prepareEmailVerificationTemplate(verificationCode),
    //     category: "Account Verification",
    // };

    // await sendVerificationEmail(brevoOptions);
};

module.exports = { sendEmailVerificationMail };