const path = require('path');
const multer = require('multer');

// Configure storage logic
const picturesStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/pictures/'); // Make sure this folder exists
    },
    filename: (req, file, cb) => {
        cb(null, req.user.id + '-' + Date.now() + path.extname(file.originalname));
    }
});
// Initialize upload middleware
const pictureUpload = multer({ storage: picturesStorage });




const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/pictures/'),
    filename: (req, file, cb) => cb(null, req.user.id + '-' + Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });




// // Configure storage logic
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         cb(null, 'uploads/'); // Make sure this folder exists
//     },
//     filename: (req, file, cb) => {
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//         cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
//     }
// });

// // Initialize upload middleware
// const upload = multer({ storage });


exports.pictureUpload = pictureUpload;
exports.upload = upload;