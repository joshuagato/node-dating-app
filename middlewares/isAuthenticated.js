const { createDecoder } = require('fast-jwt');
const User = require('../models/User');

const isAuthenticated = async (req, res, next) => {
    let token = req.cookies.token || req.headers.authorization || req.headers.token;
    
    const message = 'Token not found.';
    if (!token) return res.status(404).json({ success: false, message });

    if (token.includes('Bearer'))
        token = token.split(' ')[1];

    const decode = createDecoder();
    const userId = decode(token).id;
    if (!userId) return res.status(404).json({ success: false, message });
    
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message });
    
    delete user.dataValues.password;

    req.user = user;

    next();
}

module.exports = { IsAuthenticated: isAuthenticated };