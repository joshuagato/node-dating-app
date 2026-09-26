const SibApiV3Sdk = require('sib-api-v3-sdk');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;


exports.sendVerificationEmail = async options => {
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    // const apiInstance = new SibApiV3Sdk.EmailCampaignsApi();
    // const sendSmtpEmail = new SibApiV3Sdk.CreateEmailCampaign();

    sendSmtpEmail.sender = options.sender;
    sendSmtpEmail.to = options.to;
    sendSmtpEmail.subject = options.subject;
    sendSmtpEmail.htmlContent = options.htmlContent;

    // return apiInstance.createEmailCampaign(sendSmtpEmail);
    return apiInstance.sendTransacEmail(sendSmtpEmail);
};