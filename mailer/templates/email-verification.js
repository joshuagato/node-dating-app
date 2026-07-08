const prepareEmailVerificationTemplate = verificationCode => {
    // 1. Store your HTML template in a template literal string
    const htmlTemplate = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: #f4f5f7;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
            }
            .wrapper {
                width: 100%;
                table-layout: fixed;
                background-color: #f4f5f7;
                padding: 40px 0;
            }
            .container {
                max-width: 600px;
                background-color: #ffffff;
                margin: 0 auto;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                overflow: hidden;
            }
            .header {
                background-color: #2563eb; /* Adjust brand color here */
                padding: 30px;
                text-align: center;
            }
            .header h1 {
                color: #ffffff;
                margin: 0;
                font-size: 24px;
                font-weight: 600;
                letter-spacing: -0.5px;
            }
            .content {
                padding: 40px 30px;
                color: #334155;
                line-height: 1.6;
            }
            .content p {
                font-size: 16px;
                margin-top: 0;
                margin-bottom: 24px;
            }
            .code-container {
                text-align: center;
                margin: 30px 0;
                padding: 20px;
                background-color: #f8fafc;
                border-radius: 6px;
                border: 1px dashed #cbd5e1;
            }
            .verification-code {
                font-family: 'Courier New', Courier, monospace;
                font-size: 36px;
                font-weight: 700;
                letter-spacing: 8px;
                color: #1e293b;
                margin: 0;
                padding-left: 8px; /* Counteracts the letter-spacing offset */
            }
            .expiry-text {
                font-size: 14px;
                color: #64748b;
                text-align: center;
                margin-bottom: 24px;
            }
            .footer {
                background-color: #f8fafc;
                padding: 20px 30px;
                text-align: center;
                border-top: 1px solid #e2e8f0;
            }
            .footer p {
                font-size: 12px;
                color: #94a3b8;
                margin: 0;
            }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <h1>Verify Your Email Address</h1>
                </div>
                
                <!-- Content -->
                <div class="content">
                    <p>Hello,</p>
                    <p>Thank you for signing up! To complete your registration and secure your account, please enter the 4-digit verification code below on the setup screen:</p>
                    
                    <!-- Verification Code Box -->
                    <div class="code-container">
                        <h2 class="verification-code">{{CODE}}</h2>
                    </div>
                    
                    <p class="expiry-text">This code will expire after <strong>1 hour</strong> for security reasons.</p>
                    
                    <p>If you did not request this code or create an account with us, you can safely ignore this email. Someone may have typed your email address by mistake.</p>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <p>This is an automated security message. Please do not reply directly to this email.</p>
                </div>
            </div>
        </div>
    </body>
    </html>`;

    // 2. Dynamically replace the placeholder with the runtime 4-digit code
    const finalHtml = htmlTemplate.replace('{{CODE}}', verificationCode);
    return finalHtml;
}

module.exports = { prepareEmailVerificationTemplate };