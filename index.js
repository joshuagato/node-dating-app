const http = require('http');
const path = require('path');
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { log } = require('console-log-colors');
const { Server } = require('socket.io');

const { connectPostgreSql } = require('./database/postgresql');
const { apiRouter } = require('./routes');
const { initChatSocket, onlineUsers } = require('./sockets/chatSocket');

const app = express();
const router = express.Router();

app.use(cookieParser());

// Adds headers: Access-Control-Allow-Origin: *
app.use(cors({
    origin: process.env.FRONTEND_BASE_URL,
    credentials: true
}));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_BASE_URL,
        methods: ['GET', 'POST'],
        credentials: true
    },
});

initChatSocket(io);

app.set('io', io);

// io.on('connection', (socket) => {
//     socket.on('join_conversation', ({ conversationId }) => {
//         console.log('message: ' + conversationId);
//     });
// });

const renderProtocol = host => host.includes('localhost') ? 'http' : 'https';

// middleware that is specific to this router
const timeLog = (req, res, next) => {
    log.cyan(`URL: ${renderProtocol(req.host)}://${req.host}${req.url}`, `Time: ${new Date(Date.now())}`);
    next();
};
router.use(timeLog);
app.use(router); // If placed at the bottom, any other router apart from those in this file won't be registered

// Middleware to parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Making the pictures folder accessible
app.use("/pictures", express.static(path.join(__dirname, "pictures")));

app.use('/uploads/pictures', express.static(path.join(__dirname, 'uploads', 'pictures')));

app.get('/', (req, res) => {
    res.send('Welcome to the API');
});

app.use('/api', apiRouter);

const port = process.env.PORT || 4001;

server.listen(port, () => {
    log.magenta(`Running on http://localhost:${port}`);
    connectPostgreSql();
});


// 8f97077c9af1b3b698d3636b76de76a8