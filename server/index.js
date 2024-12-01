require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer'); // For handling file uploads
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');



const app = express();
app.use(express.json());
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://unknown-chats.web.app",  // Frontend URL
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());


// Serve static files (media uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Append the current timestamp to the file name
    }
});
const upload = multer({ storage });

// Handle file upload
app.post('/upload', upload.single('media'), (req, res) => {
    const filePath = `https://chat-app-33o0.onrender.com/uploads/${req.file.filename}`;
    res.json({ filePath });
});

const groups = {};  // In-memory storage for group messages

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Handle joining a group
    socket.on('joinGroup', ({ username, groupId }) => {
        socket.join(groupId);
        console.log(`${username} joined group: ${groupId}`);

        const joinMessage = {
            content: `${username} has joined the group.`,
            senderId: 'system',
            timestamp: new Date(),
            status: 'delivered' // Initially delivered
        };
        if (!groups[groupId]) groups[groupId] = [];
        groups[groupId].push(joinMessage);

        io.to(groupId).emit('message', joinMessage);  // Notify the group
    });

    // Handle sending messages
    socket.on('sendMessage', (message) => {
        console.log('Message received:', message);
        if (!groups[message.groupId]) groups[message.groupId] = [];
        groups[message.groupId].push(message);
        io.to(message.groupId).emit('message', message);  // Broadcast to the group
    });

    // Handle message seen acknowledgment
    socket.on('seenMessage', ({ groupId, timestamp }) => {
        const messageSeen = {
            groupId,
            timestamp,
            senderId: 'system' // system message to indicate a message was seen
        };
        io.to(groupId).emit('messageSeen', messageSeen);
    });


    socket.on('sendMessage', (message) => {
        message.status = 'sent';
 
        socket.on('markAsSeen', ({ messageId, groupId }) => {
            // Update the message status in the database (optional)
            // Notify all users in the group
            io.to(groupId).emit('messageStatus', { messageId, status: 'seen' });
        });
        
    
        // Simulate a delay for message delivery
        setTimeout(() => {
            message.status = 'delivered';
            io.to(message.groupId).emit('messageStatus', {
                messageId: message.timestamp,
                status: 'delivered'
            });
    
            // Simulate a delay for message seen
            setTimeout(() => {
                message.status = 'seen';
                io.to(message.senderId).emit('messageStatus', {
                    messageId: message.timestamp,
                    status: 'seen'
                });
            }, 0);
        }, 0);
    });
    

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});


mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.log(err));
    console.log('MongoDB URI:', process.env.MONGODB_URI); // This should log the correct URI

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    gender: { type: String, required: true },
    location: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

// Registration Endpoint
app.post('/register', async (req, res) => {
    const { username, password, confirmPassword, gender, location } = req.body;

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, gender, location });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Login Endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});



const groupSchema = new mongoose.Schema({
    groupId: { type: String, required: true, unique: true },
    groupName: { type: String, required: true }
});
const Group = mongoose.model('Group', groupSchema);

// Fetch all groups
app.get('/groups', async (req, res) => {
    try {
        const groups = await Group.find({});
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});


server.listen(5000, () => {
    console.log('Server running on http://localhost:5000');
});
