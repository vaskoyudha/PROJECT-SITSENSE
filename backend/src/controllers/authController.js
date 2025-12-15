const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

const register = async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                profile: {
                    create: {
                        displayName: name || email.split('@')[0],
                        needsSetup: true // Assuming we might want this flag, though schema didn't have it explicitly, I'll stick to schema for now or add it if needed. 
                        // Schema has: displayName, birthDate, height, weight, preferences
                    }
                }
            },
            include: { profile: true }
        });

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.profile?.displayName
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            include: { profile: true }
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.profile?.displayName,
                profile: user.profile
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId; // From middleware
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: user.id,
            email: user.email,
            profile: user.profile
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { displayName, birthDate, height, weight, preferences } = req.body;

        const profile = await prisma.profile.update({
            where: { userId },
            data: {
                displayName,
                birthDate: birthDate ? new Date(birthDate) : undefined,
                height: height ? parseFloat(height) : undefined,
                weight: weight ? parseFloat(weight) : undefined,
                preferences
            }
        });

        res.json({ message: 'Profile updated', profile });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = { register, login, getProfile, updateProfile };
