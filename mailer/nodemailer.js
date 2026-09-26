const nodemailer = require('nodemailer');
const dns = require('node:dns');

dns.setDefaultResultOrder('ipv4first');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,                                    // e.g., smtp.gmail.com or smtp.mailtrap.io
    port: Number(process.env.SMTP_PORT),                                     // 587 (TLS/STARTTLS) or 465 (SSL)
    secure: true,                                                                  // true for port 465, false for port 587
    auth: {
        user: process.env.SMTP_USER,                      // Your SMTP username or email
        pass: process.env.SMTP_PASS,                       // Your SMTP password or App Password
    },
});

exports.transporter = transporter;