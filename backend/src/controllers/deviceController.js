const receiveData = async (req, res) => {
    try {
        const { userId, pressureMatrix, ultrasonic, postureScore, isGoodPosture } = req.body;

        if (!userId) {
            return res.status(400).json({ message: 'UserId is required' });
        }

        // Broadcast to Socket.io
        const io = req.app.get('io');
        if (io) {
            io.to(`monitor:${userId}`).emit('device_update', {
                pressureMatrix,
                ultrasonic,
                postureScore,
                isGoodPosture,
                timestamp: Date.now()
            });
        }

        // Optional: We could buffer data here and save to DB periodically, 
        // but for now we just rely on the client to send a "save session" request 
        // or we can implement a background job later.
        // The current requirement is just real-time monitoring.

        res.status(200).json({ message: 'Data received' });
    } catch (error) {
        console.error('Receive device data error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { receiveData };
