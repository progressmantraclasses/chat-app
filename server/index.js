const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer'); // For handling file uploads
const path = require('path');

const app = express();
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

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});