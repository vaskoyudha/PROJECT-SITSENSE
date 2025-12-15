const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getSessions = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { from, to } = req.query;

        const where = { userId };
        if (from || to) {
            where.startTime = {};
            if (from) where.startTime.gte = new Date(parseInt(from));
            if (to) where.startTime.lte = new Date(parseInt(to));
        }

        const sessions = await prisma.session.findMany({
            where,
            orderBy: { startTime: 'desc' }
        });

        res.json(sessions);
    } catch (error) {
        console.error('Get sessions error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getSessionById = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const session = await prisma.session.findFirst({
            where: { id, userId }
        });

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        res.json(session);
    } catch (error) {
        console.error('Get session by id error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const createSession = async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            startTime, endTime, durationSeconds,
            avgPostureScore, goodPostureCount, badPostureCount, alertCount, notes
        } = req.body;

        const session = await prisma.session.create({
            data: {
                userId,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                durationSeconds,
                avgPostureScore,
                goodPostureCount,
                badPostureCount,
                alertCount,
                notes
            }
        });

        res.status(201).json(session);
    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { getSessions, getSessionById, createSession };
