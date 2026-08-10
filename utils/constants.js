const VERIFICATION_CHANNEL = {
    SIGNUP: 'signup', LOGIN: 'login'
}

const GENDER = {
    MAN: 'man', MEN: 'men', WOMAN: 'woman', WOMEN: 'women', EVERONE: 'everyone'
}

const ENCOUNTER_ACTION = {
    LIKE: 'like', DISLIKE: 'dislike', SUPER_LIKE: 'super-like', PASS: 'pass'
}

const MATCH_STATUS = {
    ACTIVE: 'active', ARCHIVED: 'archived', BLOCKED: 'blocked', REPORTED: 'reported'
};

const TWENTY_FOUR_HOURS_FROM_NOW = new Date(Date.now() + 24 * 60 * 60 * 1000);

const TWENTY_FOUR_HOURS_BEFORE_NOW = new Date(Date.now() - 24 * 60 * 60 * 1000);

module.exports = {
    VERIFICATION_CHANNEL, GENDER, TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW,
    ENCOUNTER_ACTION, MATCH_STATUS
};