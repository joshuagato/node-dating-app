const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');
// const sequelize = new Sequelize('sqlite::memory:');

const { GENDER } = require('../utils/constants');

const User = postgresSequelize.define('User',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        email: { type: DataTypes.STRING, unique: true, allowNull: false },
        first_name: { type: DataTypes.STRING },
        last_name: { type: DataTypes.STRING },
        other_names: { type: DataTypes.STRING },
        gender: { type: DataTypes.ENUM, values: [GENDER.MAN, GENDER.WOMAN] },
        interested_in: { type: DataTypes.ENUM, values: [GENDER.MEN, GENDER.WOMEN, GENDER.EVERONE] },
        date_of_birth: { type: DataTypes.DATEONLY },
        country: { type: DataTypes.STRING },
        password: { type: DataTypes.STRING, allowNull: false },
        email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
        email_verification_code: { type: DataTypes.STRING(4), defaultValue: null },
        email_verification_code_expiration: { type: DataTypes.DATE, defaultValue: null },
        password_reset_code: { type: DataTypes.STRING(6), defaultValue: null },
        password_reset_code_expiration: { type: DataTypes.DATE, defaultValue: null },
    },
    {

    },
);

module.exports = User;