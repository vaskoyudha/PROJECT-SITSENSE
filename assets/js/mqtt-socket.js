/**
 * MQTT Socket Client for SitSense
 * 
 * Connects to backend Socket.IO and receives MQTT sensor data
 * Provides same interface as Firebase for seamless integration
 */

(function () {
    'use strict';

    // Configuration
    const BACKEND_URL = window.SITSENSE_BACKEND_URL || 'http://localhost:3000';

    let socket = null;
    let currentDeviceId = null;
    let connectionAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;

    // Callbacks
    let onDataCallback = null;
    let onStatusCallback = null;
    let onDevicesListCallback = null;
    let onConnectionChangeCallback = null;

    /**
     * Initialize Socket.IO connection to backend
     */
    function connect(options = {}) {
        if (socket && socket.connected) {
            console.log('[MQTT-Socket] Already connected');
            return Promise.resolve(socket);
        }

        return new Promise((resolve, reject) => {
            const url = options.backendUrl || BACKEND_URL;
            console.log('[MQTT-Socket] Connecting to:', url);

            // Load Socket.IO client if not available
            if (typeof io === 'undefined') {
                console.error('[MQTT-Socket] Socket.IO client not loaded');
                reject(new Error('Socket.IO client not loaded'));
                return;
            }

            socket = io(url, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
            });

            socket.on('connect', () => {
                console.log('[MQTT-Socket] ✅ Connected to backend');
                connectionAttempts = 0;

                if (onConnectionChangeCallback) {
                    onConnectionChangeCallback(true);
                }

                // Re-join device room if we had one
                if (currentDeviceId) {
                    socket.emit('join_mqtt_device', currentDeviceId);
                }

                resolve(socket);
            });

            socket.on('disconnect', (reason) => {
                console.log('[MQTT-Socket] ⚠️ Disconnected:', reason);
                if (onConnectionChangeCallback) {
                    onConnectionChangeCallback(false);
                }
            });

            socket.on('connect_error', (error) => {
                console.error('[MQTT-Socket] Connection error:', error);
                connectionAttempts++;

                if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.error('[MQTT-Socket] Max reconnection attempts reached');
                    reject(error);
                }
            });

            // Handle sensor data from MQTT
            socket.on('mqtt_sensor_data', (data) => {
                console.log('[MQTT-Socket] 📡 Sensor data:', data.deviceId);
                if (onDataCallback) {
                    onDataCallback(data);
                }
            });

            // Handle any device data (for auto-detection)
            socket.on('mqtt_any_device_data', (data) => {
                // Only use if we haven't joined a specific device
                if (!currentDeviceId && onDataCallback) {
                    console.log('[MQTT-Socket] 📡 Auto-detected device:', data.deviceId);
                    currentDeviceId = data.deviceId;
                    socket.emit('join_mqtt_device', data.deviceId);
                    onDataCallback(data);
                }
            });

            // Handle device status
            socket.on('mqtt_device_status', (data) => {
                console.log('[MQTT-Socket] Device status:', data.deviceId, data.online ? 'online' : 'offline');
                if (onStatusCallback) {
                    onStatusCallback(data);
                }
            });

            // Handle device heartbeat (for IP, RSSI, uptime)
            socket.on('mqtt_device_heartbeat', (data) => {
                console.log('[MQTT-Socket] Heartbeat:', data.deviceId);
                if (onStatusCallback) {
                    onStatusCallback({
                        ...data,
                        isHeartbeat: true
                    });
                }
            });

            // Handle devices list response
            socket.on('mqtt_devices_list', (data) => {
                console.log('[MQTT-Socket] Devices list:', data.devices.length);
                if (onDevicesListCallback) {
                    onDevicesListCallback(data.devices);
                }
            });

            // Timeout for initial connection
            setTimeout(() => {
                if (!socket.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    /**
     * Join a specific device's data stream
     */
    function joinDevice(deviceId) {
        if (!socket || !socket.connected) {
            console.warn('[MQTT-Socket] Not connected, cannot join device');
            return false;
        }

        currentDeviceId = deviceId;
        socket.emit('join_mqtt_device', deviceId);
        console.log('[MQTT-Socket] Joined device:', deviceId);
        return true;
    }

    /**
     * Request list of available devices
     */
    function getDevices() {
        if (!socket || !socket.connected) {
            console.warn('[MQTT-Socket] Not connected, cannot get devices');
            return;
        }
        socket.emit('get_mqtt_devices');
    }

    /**
     * Set callback for sensor data
     */
    function onData(callback) {
        onDataCallback = callback;
    }

    /**
     * Set callback for device status changes
     */
    function onStatus(callback) {
        onStatusCallback = callback;
    }

    /**
     * Set callback for devices list
     */
    function onDevicesList(callback) {
        onDevicesListCallback = callback;
    }

    /**
     * Set callback for connection state changes
     */
    function onConnectionChange(callback) {
        onConnectionChangeCallback = callback;
    }

    /**
     * Check if connected
     */
    function isConnected() {
        return socket && socket.connected;
    }

    /**
     * Get current device ID
     */
    function getCurrentDevice() {
        return currentDeviceId;
    }

    /**
     * Disconnect from backend
     */
    function disconnect() {
        if (socket) {
            socket.disconnect();
            socket = null;
            currentDeviceId = null;
        }
    }

    // Export to global scope
    window.SitSenseMQTT = {
        connect,
        joinDevice,
        getDevices,
        onData,
        onStatus,
        onDevicesList,
        onConnectionChange,
        isConnected,
        getCurrentDevice,
        disconnect
    };

    console.log('[MQTT-Socket] Module loaded');
})();
