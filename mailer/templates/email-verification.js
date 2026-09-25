const prepareEmailVerificationTemplate = verificationCode => {
    // 1. Store your HTML template in a template literal string
    const htmlTemplate = `<!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email — Crushr</title>
            <!--[if mso]>
            <noscript>
                <xml>
                    <o:OfficeDocumentSettings>
                        <o:PixelsPerInch>96</o:PixelsPerInch>
                    </o:OfficeDocumentSettings>
                </xml>
            </noscript>
            <![endif]-->
            <style>
                /* ------------------------------------------------------------------ */
                /* Resets                                                              */
                /* ------------------------------------------------------------------ */
                * {
                    box-sizing: border-box;
                }
                html, body {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    overflow-x: hidden;
                    -webkit-text-size-adjust: 100%;
                    -ms-text-size-adjust: 100%;
                }
                table, td, tr {
                    border-collapse: collapse;
                }
                img {
                    -ms-interpolation-mode: bicubic;
                    border: 0;
                    outline: none;
                    text-decoration: none;
                    max-width: 100%;
                    height: auto;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                        Helvetica, Arial, sans-serif;
                    background-color: #0f172a;
                    color: #334155;
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                }
                a {
                    text-decoration: none;
                    color: inherit;
                }

                /* ------------------------------------------------------------------ */
                /* Layout wrapper                                                      */
                /* ------------------------------------------------------------------ */
                .wrapper {
                    width: 100%;
                    table-layout: fixed;
                    background-color: #0f172a;
                    padding: 40px 5%;
                }
                .container {
                    max-width: 560px;
                    width: 100%;
                    background-color: #ffffff;
                    margin: 0 auto;
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
                }

                /* ------------------------------------------------------------------ */
                /* Brand header                                                        */
                /* ------------------------------------------------------------------ */
                .brand-header {
                    padding: 32px 32px 8px 32px;
                    text-align: center;
                }
                .brand-mark {
                    display: inline-block;
                    width: 64px;
                    height: 64px;
                    border-radius: 18px;
                    background: linear-gradient(135deg, #7c3aed 0%, #ec4899 55%, #f59e0b 100%);
                    line-height: 64px;
                    text-align: center;
                    font-size: 30px;
                    color: #ffffff;
                    box-shadow: 0 10px 24px rgba(236, 72, 153, 0.35);
                }
                .brand-name {
                    margin: 16px 0 0 0;
                    font-size: 26px;
                    font-weight: 800;
                    letter-spacing: -0.5px;
                    color: #0f172a;
                }
                .brand-name .accent {
                    background: linear-gradient(90deg, #7c3aed 0%, #ec4899 50%, #f59e0b 100%);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                }

                /* ------------------------------------------------------------------ */
                /* Hero band                                                           */
                /* ------------------------------------------------------------------ */
                .hero {
                    padding: 8px 32px 0 32px;
                    text-align: center;
                }
                .hero-title {
                    margin: 16px 0 0 0;
                    font-size: 22px;
                    font-weight: 700;
                    color: #0f172a;
                    letter-spacing: -0.3px;
                }
                .hero-subtitle {
                    margin: 12px 0 0 0;
                    font-size: 15px;
                    line-height: 1.6;
                    color: #64748b;
                }

                /* ------------------------------------------------------------------ */
                /* Content                                                             */
                /* ------------------------------------------------------------------ */
                .content {
                    padding: 24px 32px 8px 32px;
                    color: #334155;
                    line-height: 1.65;
                    font-size: 15px;
                }
                .content p {
                    margin: 0 0 16px 0;
                }

                /* ------------------------------------------------------------------ */
                /* Verification code card                                              */
                /* ------------------------------------------------------------------ */
                .code-card {
                    margin: 24px 0;
                    padding: 24px 16px;
                    border-radius: 16px;
                    background: linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%,
                        rgba(236, 72, 153, 0.08) 55%, rgba(245, 158, 11, 0.08) 100%);
                    border: 1px solid rgba(124, 58, 237, 0.18);
                    text-align: center;
                    max-width: 100%;
                }
                .code-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.6px;
                    color: #7c3aed;
                    margin: 0 0 12px 0;
                }
                .verification-code {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 36px;
                    font-weight: 700;
                    letter-spacing: 8px;
                    color: #0f172a;
                    margin: 0;
                    padding-left: 8px;
                    line-height: 1;
                    word-break: break-all;
                }
                .code-meta {
                    margin: 14px 0 0 0;
                    font-size: 12px;
                    color: #64748b;
                }
                .code-meta strong {
                    color: #0f172a;
                    font-weight: 700;
                }

                /* ------------------------------------------------------------------ */
                /* CTA button                                                          */
                /* ------------------------------------------------------------------ */
                .cta-wrap {
                    padding: 8px 32px 24px 32px;
                    text-align: center;
                }
                .cta {
                    display: inline-block;
                    padding: 14px 32px;
                    border-radius: 12px;
                    background: linear-gradient(90deg, #7c3aed 0%, #ec4899 55%, #f59e0b 100%);
                    color: #ffffff !important;
                    font-size: 15px;
                    font-weight: 700;
                    letter-spacing: 0.2px;
                    box-shadow: 0 12px 28px rgba(236, 72, 153, 0.30);
                }

                /* ------------------------------------------------------------------ */
                /* Divider                                                             */
                /* ------------------------------------------------------------------ */
                .divider {
                    height: 1px;
                    background: linear-gradient(90deg, transparent 0%,
                        rgba(124, 58, 237, 0.25) 50%, transparent 100%);
                    margin: 8px 32px 24px 32px;
                }

                /* ------------------------------------------------------------------ */
                /* Security note                                                       */
                /* ------------------------------------------------------------------ */
                .note {
                    margin: 0 32px 24px 32px;
                    padding: 14px 16px;
                    border-radius: 12px;
                    background-color: #f8fafc;
                    border: 1px solid #e2e8f0;
                    font-size: 13px;
                    line-height: 1.55;
                    color: #64748b;
                }
                .note strong {
                    color: #334155;
                    font-weight: 600;
                }

                /* ------------------------------------------------------------------ */
                /* Footer                                                              */
                /* ------------------------------------------------------------------ */
                .footer {
                    background-color: #f8fafc;
                    padding: 24px 32px;
                    text-align: center;
                    border-top: 1px solid #e2e8f0;
                }
                .footer-tagline {
                    margin: 0 0 6px 0;
                    font-size: 12px;
                    color: #94a3b8;
                    letter-spacing: 0.3px;
                }
                .footer-copy {
                    margin: 0;
                    font-size: 11px;
                    color: #cbd5e1;
                }

                /* ------------------------------------------------------------------ */
                /* Mobile tightening — narrower viewports                              */
                /* ------------------------------------------------------------------ */
                @media (max-width: 400px) {
                    .brand-header,
                    .hero,
                    .content,
                    .cta-wrap,
                    .footer {
                        padding-left: 20px;
                        padding-right: 20px;
                    }
                    .note,
                    .divider {
                        margin-left: 20px;
                        margin-right: 20px;
                    }
                    .verification-code {
                        font-size: 32px;
                        letter-spacing: 6px;
                        padding-left: 6px;
                    }
                    .brand-mark {
                        width: 56px;
                        height: 56px;
                        line-height: 56px;
                        font-size: 26px;
                        border-radius: 16px;
                    }
                    .brand-name {
                        font-size: 22px;
                    }
                    .hero-title {
                        font-size: 20px;
                    }
                }

                /* Restore the desktop-scale code treatment on wider screens */
                @media (min-width: 480px) {
                    .verification-code {
                        font-size: 40px;
                        letter-spacing: 12px;
                        padding-left: 12px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="wrapper">
                <div class="container">

                    <!-- Brand mark -->
                    <div class="brand-header">
                        <div class="brand-mark">❤</div>
                        <h1 class="brand-name">
                            Crushr<span class="accent">.</span>
                        </h1>
                    </div>

                    <!-- Hero copy -->
                    <div class="hero">
                        <h2 class="hero-title">Verify your email address</h2>
                        <p class="hero-subtitle">
                            You're one step away from meeting someone new.
                            Enter the code below to activate your account.
                        </p>
                    </div>

                    <!-- Verification code -->
                    <div class="content">
                        <div class="code-card">
                            <p class="code-label">Your verification code</p>
                            <h3 class="verification-code">{{CODE}}</h3>
                            <p class="code-meta">
                                Expires in <strong>1 hour</strong>
                            </p>
                        </div>

                        <p style="margin-top: 8px;">
                            Hello,
                        </p>
                        <p>
                            Thanks for signing up to Crushr. For your security, please
                            enter the 4-digit code above on the verification screen to
                            complete your registration.
                        </p>
                    </div>

                    <!-- CTA -->
                    <!-- <div class="cta-wrap">
                        <a href="{{VERIFY_URL}}" class="cta">Continue Verification</a>
                    </div> -->

                    <div class="divider"></div>

                    <!-- Security note -->
                    <div class="note">
                        <strong>Didn't sign up for Crushr?</strong><br />
                        You can safely ignore this email. Someone may have typed your
                        address by mistake, and no account will be created without
                        this code.
                    </div>

                    <!-- Footer -->
                    <div class="footer">
                        <p class="footer-tagline">
                            Made with care for authentic connections.
                        </p>
                        <p class="footer-copy">
                            This is an automated security message — please don't reply.
                        </p>
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