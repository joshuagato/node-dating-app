const Mailjet = require('node-mailjet');

// Initialize with the constructor (v6+)
const mailjet = new Mailjet({
    apiKey: process.env.MAILJET_API_KEY,
    apiSecret: process.env.MAILJET_SECRET_KEY,
});

exports.sendMailJetEmail = options => {
    const request = mailjet.post('send', { version: 'v3.1' }).request({
        Messages: [
            {
                From: options.from,
                To: [
                    options.to
                ],
                Subject: options.subject,
                TextPart: options.text,
                HTMLPart: options.html,
            },
        ],
    })
    request
        .then(result => {
            console.log(result.body)
        })
        .catch(err => {
            console.log(err.statusCode)
        })
}