const VERIFICATION_CHANNEL = {
    SIGNUP: 'signup', LOGIN: 'login'
};

const GENDER = {
    MAN: 'man', MEN: 'men', WOMAN: 'woman', WOMEN: 'women', EVERONE: 'everyone'
};

const ENCOUNTER_ACTION = {
    LIKE: 'like', DISLIKE: 'dislike', SUPER_LIKE: 'super-like', PASS: 'pass'
};

const MATCH_STATUS = {
    ACTIVE: 'active', ARCHIVED: 'archived', BLOCKED: 'blocked', REPORTED: 'reported'
};

const MESSAGE_TYPE = {
    TEXT: 'text', IMAGE: 'image', AUDIO: 'audio', VIDEO: 'video', FILE: 'file', LOCATION: 'location',
    CONTACT: 'contact', STICKER: 'sticker', GIF: 'gif', POLL: 'poll', REPLY: 'reply'
};

const MESSAGE_STATUS = {
    SENT: 'sent', DELIVERED: 'delivered', READ: 'read', FAILED: 'failed'
};

const MESSAGE_DIRECTION = {
    INCOMING: 'incoming', OUTGOING: 'outgoing'
};

const CALL_TYPE = {
    AUDIO: 'audio', VIDEO: 'video'
};

const CHAT_PARTICIPANT_STATUS = {
    ACTIVE: 'active', ARCHIVED: 'archived', BLOCKED: 'blocked', MUTED: 'muted', LEFT: 'left'
};

const CHAT_NOTIFICATION = {
    ALL: 'all', MENTIONS: 'mentions', NONE: 'none'
};

const CHAT_STARTER = {
    MATCH: 'match', DIRECT: 'direct'
}

const SIGNUP_CHANNEL = {
    DIRECT: 'direct', GOOGLE: 'google'
}


const REACTION_TYPES = {
    LIKE: '❤️', LOVE: '💕', LAUGH: '😄', WOW: '😮', SAD: '😢', ANGRY: '😡'
};

const TWENTY_FOUR_HOURS_FROM_NOW = new Date(Date.now() + 24 * 60 * 60 * 1000);

const TWENTY_FOUR_HOURS_BEFORE_NOW = new Date(Date.now() - 24 * 60 * 60 * 1000);

const FREE_DAILY_ENCOUNTER_LIMIT = 5;   // change to 10 for testing
const AD_EVERY_N_CARDS = 2;              // change to 2 for testing
const FREE_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

const cloudFactorPath = 'https://';


module.exports = {
    VERIFICATION_CHANNEL, GENDER, TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW,
    ENCOUNTER_ACTION, MATCH_STATUS, MESSAGE_TYPE, MESSAGE_STATUS, MESSAGE_DIRECTION, CALL_TYPE,
    CHAT_PARTICIPANT_STATUS, CHAT_NOTIFICATION, REACTION_TYPES, CHAT_STARTER, SIGNUP_CHANNEL,
    FREE_DAILY_ENCOUNTER_LIMIT, AD_EVERY_N_CARDS, FREE_DAILY_WINDOW_MS, cloudFactorPath,
};