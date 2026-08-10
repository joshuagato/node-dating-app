const SIGNUP = 'signup';
const LOGIN = 'login';

const VERIFICATION_CHANNEL = {
    SIGNUP,
    LOGIN
}


const MAN = 'man';
const MEN = 'men';
const WOMAN = 'woman';
const WOMEN = 'women';
const EVERONE = 'everyone';

const GENDER = {
    MAN, MEN, WOMAN, WOMEN, EVERONE
}

const LIKE = 'like';
const DISLIKE = 'dislike';
const SUPER_LIKE = 'super-like';
const PASS = 'pass';

const ENCOUNTER_ACTION = {
    LIKE, DISLIKE, SUPER_LIKE, PASS
}


const TWENTY_FOUR_HOURS_FROM_NOW = new Date(Date.now() + 24 * 60 * 60 * 1000);

const TWENTY_FOUR_HOURS_BEFORE_NOW = new Date(Date.now() - 24 * 60 * 60 * 1000);

module.exports = {
    VERIFICATION_CHANNEL, GENDER, TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW,
    ENCOUNTER_ACTION
};