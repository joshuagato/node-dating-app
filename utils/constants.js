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

const REACTION_TYPES = {
    LIKE: '❤️', LOVE: '💕', LAUGH: '😄', WOW: '😮', SAD: '😢', ANGRY: '😡'
};

const TWENTY_FOUR_HOURS_FROM_NOW = new Date(Date.now() + 24 * 60 * 60 * 1000);

const TWENTY_FOUR_HOURS_BEFORE_NOW = new Date(Date.now() - 24 * 60 * 60 * 1000);

module.exports = {
    VERIFICATION_CHANNEL, GENDER, TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW,
    ENCOUNTER_ACTION, MATCH_STATUS, MESSAGE_TYPE, MESSAGE_STATUS, MESSAGE_DIRECTION, CALL_TYPE,
    CHAT_PARTICIPANT_STATUS, CHAT_NOTIFICATION, REACTION_TYPES
};