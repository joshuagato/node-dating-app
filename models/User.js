const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');
// const sequelize = new Sequelize('sqlite::memory:');

const User = postgresSequelize.define('User',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    firstname: { type: DataTypes.STRING },
    lastname: { type: DataTypes.STRING },
    date_of_birth: { type: DataTypes.DATEONLY },
    country: { type: DataTypes.STRING },
    password: { type: DataTypes.STRING, allowNull: false },
    email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    email_verification_code: { type: DataTypes.STRING, defaultValue: null },
    email_verification_code_expiration: { type: DataTypes.DATE, defaultValue: null },
    email_verification_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    password_reset_code: { type: DataTypes.STRING, defaultValue: null },
    password_reset_code_expiration: { type: DataTypes.DATE, defaultValue: null },
  },
  {
    // Other model options go here

  },
);

module.exports = User;