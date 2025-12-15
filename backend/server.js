const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for now, restrict in production
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
const authRoutes = require('./src/routes/authRoutes');
const historyRoutes = require('./src/routes/historyRoutes');
const deviceRoutes = require('./src/routes/deviceRoutes');
const aiRoutes = require('./src/routes/aiRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/ai', aiRoutes);

app.get('/', (req, res) => {
    res.send('SitSense Backend API is running');
});

// ==================== MQTT SERVICE ====================
const mqttService = require('./src/services/mqttService');

// Initialize MQTT connection
mqttService.initialize(io);

// API endpoint to get MQTT devices list
app.get('/api/mqtt/devices', (req, res) => {
    const devices = mqttService.getDevices();
    res.json({ devices });
});

// API endpoint to send command to device
app.post('/api/mqtt/command', (req, res) => {
    const { deviceId, command } = req.body;
    if (!deviceId || !command) {
        return res.status(400).json({ message: 'deviceId and command required' });
    }
    const success = mqttService.sendCommand(deviceId, command);
    res.json({ success });
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Legacy: Firebase-style monitor room
    socket.on('join_monitor', (userId) => {
        console.log(`Socket ${socket.id} joining monitor room for user ${userId}`);
        socket.join(`monitor:${userId}`);
    });

    // NEW: MQTT device monitoring
    socket.on('join_mqtt_device', (deviceId) => {
        console.log(`Socket ${socket.id} joining MQTT device room: ${deviceId}`);
        socket.join(`mqtt:${deviceId}`);

        // Send current device status
        const isOnline = mqttService.isDeviceOnline(deviceId);
        socket.emit('mqtt_device_status', { deviceId, online: isOnline });
    });

    // Request list of available MQTT devices
    socket.on('get_mqtt_devices', () => {
        const devices = mqttService.getDevices();
        socket.emit('mqtt_devices_list', { devices });
    });

    // Legacy: device_data for Firebase compatibility
    socket.on('device_data', (data) => {
        // Broadcast to the user's monitor room
        // data should contain userId or deviceId mapped to userId
        if (data.userId) {
            io.to(`monitor:${data.userId}`).emit('device_update', data);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Make io accessible in routes
app.set('io', io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
