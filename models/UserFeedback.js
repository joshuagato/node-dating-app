// models/UserFeedback.js
const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const UserFeedback = postgresSequelize.define(
    'UserFeedback',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
            onDelete: 'CASCADE',
            references: { model: 'Users', key: 'id' },
        },
        title: {
            type: DataTypes.STRING(150),
            allowNull: false,
            validate: {
                len: {
                    args: [3, 150],
                    msg: 'Title must be between 3 and 150 characters.',
                },
            },
        },
        body: {
            type: DataTypes.TEXT,
            allowNull: false,
            validate: {
                len: {
                    args: [10, 5000],
                    msg: 'Message must be between 10 and 5000 characters.',
                },
            },
        },
        // Lifecycle flags so you can triage from the admin side later.
        status: {
            type: DataTypes.ENUM,
            values: ['new', 'in_review', 'resolved', 'archived'],
            allowNull: false,
            defaultValue: 'new',
        },
        is_read: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        read_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        tableName: 'UserFeedbacks',
        timestamps: true,
    }
);

module.exports = UserFeedback;