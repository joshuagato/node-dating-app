const { MailtrapClient } = require("mailtrap");

const TOKEN = process.env.MAILTRAP_TOKEN;

// const mailtrapClient = new MailtrapClient({
//   token: TOKEN,
// });

const mailtrapClient = new MailtrapClient({
    token: TOKEN, // API Token from Sandbox Settings
    sandbox: true,
    testInboxId: 4754758,                      // Found in your Mailtrap Sandbox Inbox settings
});

module.exports = { mailtrapClient }