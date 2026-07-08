require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const router = express.Router();

app.use(cookieParser());

const { log } = require('console-log-colors');

const { connectPostgreSql } = require('./database/postgresql');

const { authRouter } = require('./routes/auth');

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

app.get('/', (req, res) => {
  res.send('Hello World!');
});

router.get('/login', (req, res) => {
  res.json({msg: 'Auth login page', obj: req.headers});
});

app.use('/auth', authRouter);

const port = process.env.PORT || 4001;

app.listen(port, () => {
  log.magenta(`Running on http://localhost:${port}`);
  connectPostgreSql();
});


// 8f97077c9af1b3b698d3636b76de76a8