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
    MAN,
    MEN,
    WOMAN,
    WOMEN,
    EVERONE
}


const TWENTY_FOUR_HOURS_FROM_NOW = new Date(Date.now() + 24 * 60 * 60 * 1000);

const TWENTY_FOUR_HOURS_BEFORE_NOW = new Date(Date.now() - 24 * 60 * 60 * 1000);

module.exports = { VERIFICATION_CHANNEL, GENDER, TWENTY_FOUR_HOURS_FROM_NOW, TWENTY_FOUR_HOURS_BEFORE_NOW };