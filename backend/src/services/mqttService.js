/**
 * MQTT Service for SitSense
 * 
 * Subscribes to ESP32 sensor data from MQTT broker
 * and broadcasts to frontend via Socket.IO
 */

const mqtt = require('mqtt');

// MQTT Configuration
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://test.mosquitto.org';
const MQTT_PORT = process.env.MQTT_PORT || 1883;

// Topics to subscribe
const TOPICS = {
    DATA: 'kursi/data/#',
    STATUS: 'kursi/status/#',
    HEARTBEAT: 'kursi/heartbeat/#'
};

let client = null;
let io = null;

// Device status tracking
const deviceStatus = new Map();

/**
 * Initialize MQTT connection and setup handlers
 * @param {Object} socketIo - Socket.IO server instance
 */
function initialize(socketIo) {
    io = socketIo;

    const brokerUrl = `${MQTT_BROKER}:${MQTT_PORT}`;
    console.log(`[MQTT] Connecting to broker: ${brokerUrl}`);

    client = mqtt.connect(MQTT_BROKER, {
        port: MQTT_PORT,
        clientId: `sitsense_backend_${Date.now()}`,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30000
    });

    // Connection handlers
    client.on('connect', () => {
        console.log('[MQTT] ✅ Connected to broker');

        // Subscribe to all topics
        Object.values(TOPICS).forEach(topic => {
            client.subscribe(topic, (err) => {
                if (err) {
                    console.error(`[MQTT] ❌ Failed to subscribe to ${topic}:`, err);
                } else {
                    console.log(`[MQTT] 📡 Subscribed to: ${topic}`);
                }
            });
        });
    });

    client.on('error', (err) => {
        console.error('[MQTT] ❌ Connection error:', err);
    });

    client.on('reconnect', () => {
        console.log('[MQTT] 🔄 Reconnecting...');
    });

    client.on('close', () => {
        console.log('[MQTT] ⚠️ Connection closed');
    });

    // Message handler
    client.on('message', (topic, message) => {
        try {
            const payload = message.toString();
            const topicParts = topic.split('/');
            const topicType = topicParts[1]; // 'data', 'status', or 'heartbeat'
            const deviceId = topicParts[2];  // ESP32_Kursi_XXXX

            console.log(`[MQTT] 📨 ${topicType} from ${deviceId}`);

            switch (topicType) {
                case 'data':
                    handleSensorData(deviceId, payload);
                    break;
                case 'status':
                    handleDeviceStatus(deviceId, payload);
                    break;
                case 'heartbeat':
                    handleHeartbeat(deviceId, payload);
                    break;
                default:
                    console.log(`[MQTT] Unknown topic type: ${topicType}`);
            }
        } catch (err) {
            console.error('[MQTT] Error processing message:', err);
        }
    });
}

/**
 * Handle sensor data from ESP32
 * Format: {"fsr":123,"back":12.3,"neck":45.6,"ts":123456789}
 */
function handleSensorData(deviceId, payload) {
    try {
        const data = JSON.parse(payload);

        // Transform to match existing frontend format
        const transformed = {
            fsr: data.fsr || 0,
            ultrasonic: {
                punggung_cm: data.back !== -1 ? data.back : null,
                leher_cm: data.neck !== -1 ? data.neck : null
            },
            timestamp: data.ts || Date.now()
        };

        // Update device status
        deviceStatus.set(deviceId, {
            ...deviceStatus.get(deviceId),
            lastData: Date.now(),
            online: true
        });

        // Broadcast to all connected clients monitoring this device
        if (io) {
            // Emit to device-specific room
            io.to(`mqtt:${deviceId}`).emit('mqtt_sensor_data', {
                deviceId,
                ...transformed
            });

            // Also emit to general room for any device
            io.emit('mqtt_any_device_data', {
                deviceId,
                ...transformed
            });
        }
    } catch (err) {
        console.error('[MQTT] Error parsing sensor data:', err);
    }
}

/**
 * Handle device status updates
 */
function handleDeviceStatus(deviceId, payload) {
    const status = payload.toString();
    const isOnline = status === 'online';

    deviceStatus.set(deviceId, {
        ...deviceStatus.get(deviceId),
        online: isOnline,
        lastStatusUpdate: Date.now()
    });

    if (io) {
        io.emit('mqtt_device_status', { deviceId, online: isOnline });
    }
}

/**
 * Handle heartbeat from device
 * Format: {"uptime":123,"rssi":-65,"ip":"192.168.x.x"}
 */
function handleHeartbeat(deviceId, payload) {
    try {
        const heartbeat = JSON.parse(payload);

        deviceStatus.set(deviceId, {
            ...deviceStatus.get(deviceId),
            online: true,
            lastHeartbeat: Date.now(),
            ip: heartbeat.ip,
            rssi: heartbeat.rssi,
            uptime: heartbeat.uptime
        });

        if (io) {
            io.emit('mqtt_device_heartbeat', {
                deviceId,
                ...heartbeat,
                online: true
            });
        }
    } catch (err) {
        console.error('[MQTT] Error parsing heartbeat:', err);
    }
}

/**
 * Get list of known devices
 */
function getDevices() {
    const devices = [];
    deviceStatus.forEach((status, deviceId) => {
        devices.push({ deviceId, ...status });
    });
    return devices;
}

/**
 * Check if a device is online (had data in last 10 seconds)
 */
function isDeviceOnline(deviceId) {
    const status = deviceStatus.get(deviceId);
    if (!status) return false;
    const lastActivity = status.lastData || status.lastHeartbeat || 0;
    return (Date.now() - lastActivity) < 10000; // 10 second timeout
}

/**
 * Send command to device via MQTT
 */
function sendCommand(deviceId, command) {
    if (!client || !client.connected) {
        console.error('[MQTT] Cannot send command: Not connected');
        return false;
    }

    const topic = `kursi/cmd/${deviceId}`;
    client.publish(topic, command);
    console.log(`[MQTT] 📤 Sent command to ${deviceId}: ${command}`);
    return true;
}

/**
 * Disconnect from MQTT broker
 */
function disconnect() {
    if (client) {
        client.end();
        console.log('[MQTT] Disconnected');
    }
}

module.exports = {
    initialize,
    getDevices,
    isDeviceOnline,
    sendCommand,
    disconnect
};
