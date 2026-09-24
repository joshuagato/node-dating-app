const UserFeedback = require('../models/UserFeedback');
const User = require('../models/User');

User.hasMany(UserFeedback, {
    foreignKey: 'user_id',
    as: 'feedbacks',
    onDelete: 'CASCADE',
});

UserFeedback.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user',
});

exports.submitFeedback = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res
                .status(401)
                .json({ success: false, message: 'Unauthorized' });
        }

        const { title, body } = req.body || {};

        // Trim before validation so whitespace-only strings don't sneak
        // past the length check.
        const cleanTitle = String(title || '').trim();
        const cleanBody = String(body || '').trim();

        if (cleanTitle.length < 3 || cleanTitle.length > 150) {
            return res.status(400).json({
                success: false,
                message: 'Title must be between 3 and 150 characters.',
            });
        }
        if (cleanBody.length < 10 || cleanBody.length > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Message must be between 10 and 5000 characters.',
            });
        }

        const feedback = await UserFeedback.create({
            user_id: user.id,
            title: cleanTitle,
            body: cleanBody,
        });

        return res.status(201).json({
            success: true,
            message: 'Thanks — your message has been received.',
            feedback: {
                id: feedback.id,
                title: feedback.title,
                status: feedback.status,
                created_at: feedback.createdAt,
            },
        });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to submit message',
            error: error.message,
        });
    }
};

/* ------------------------------------------------------------------ */
/* GET /api/feedback/mine                                             */
/* Returns the current user's own submitted messages (newest first).  */
/* ------------------------------------------------------------------ */
exports.getMyFeedback = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res
                .status(401)
                .json({ success: false, message: 'Unauthorized' });
        }

        const items = await UserFeedback.findAll({
            where: { user_id: user.id },
            order: [['createdAt', 'DESC']],
            attributes: [
                'id',
                'title',
                'body',
                'status',
                'is_read',
                'createdAt',
            ],
            limit: 50,
        });

        return res.json({ success: true, feedback: items });
    } catch (error) {
        console.error('Error fetching own feedback:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to load your messages',
            error: error.message,
        });
    }
};