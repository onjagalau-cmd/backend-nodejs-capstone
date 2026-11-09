const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const connectToDatabase = require('../models/db');

const router = express.Router();
const secret = process.env.JWT_SECRET || 'development-only-secret';
async function users() { return (await connectToDatabase()).collection('users'); }

router.post('/register', async (req, res, next) => {
    try {
        const { firstName, lastName, email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
        const collection = await users();
        if (await collection.findOne({ email })) return res.status(409).json({ error: 'Email already in use' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await collection.insertOne({ firstName, lastName, email, password: hashedPassword });
        res.status(201).json({ id: result.insertedId, firstName, lastName, email });
    } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await (await users()).findOne({ email });
        if (!user || !(await bcrypt.compare(password || '', user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const authtoken = jwt.sign({ user: { id: user._id.toString() } }, secret, { expiresIn: '1h' });
        res.json({ authtoken, userName: user.firstName, userEmail: user.email });
    } catch (error) { next(error); }
});

async function requireAuth(req, res, next) {
    try {
        const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-auth-token');
        if (!token) return res.status(401).json({ error: 'Authentication required' });
        const payload = jwt.verify(token, secret);
        req.userId = new ObjectId(payload.user.id);
        next();
    } catch (_error) { res.status(401).json({ error: 'Invalid token' }); }
}

router.get('/profile', requireAuth, async (req, res, next) => {
    try {
        const user = await (await users()).findOne({ _id: req.userId }, { projection: { password: 0 } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) { next(error); }
});

router.put('/profile', requireAuth, async (req, res, next) => {
    try {
        const { firstName, lastName } = req.body;
        const changes = Object.fromEntries(Object.entries({ firstName, lastName }).filter(([, value]) => value !== undefined));
        if (!Object.keys(changes).length) return res.status(400).json({ error: 'No changes supplied' });
        const user = await (await users()).findOneAndUpdate(
            { _id: req.userId }, { $set: changes }, { returnDocument: 'after', projection: { password: 0 } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) { next(error); }
});

module.exports = router;
