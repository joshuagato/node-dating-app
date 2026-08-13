const path = require('path');
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { log } = require('console-log-colors');

const { connectPostgreSql } = require('./database/postgresql');
const { apiRouter } = require('./routes');

const app = express();
const router = express.Router();

app.use(cookieParser());

// Adds headers: Access-Control-Allow-Origin: *
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}))

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

router.use('/uploads/pictures', express.static(path.join(__dirname, 'uploads', 'pictures')));

router.get('/', (req, res) => {
    res.send('Welcome to the API');
});

router.use('/api', apiRouter);

const port = process.env.PORT || 4001;

app.listen(port, () => {
    log.magenta(`Running on http://localhost:${port}`);
    connectPostgreSql();
});


// 8f97077c9af1b3b698d3636b76de76a8