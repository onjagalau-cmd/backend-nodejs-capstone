const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ObjectId } = require('mongodb');
const connectToDatabase = require('../models/db');
const logger = require('../logger');

const router = express.Router();
const directoryPath = path.join(__dirname, '..', 'public', 'images');
fs.mkdirSync(directoryPath, { recursive: true });
const upload = multer({ storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, directoryPath),
    filename: (_req, file, cb) => cb(null, path.basename(file.originalname)),
}) });

async function collection() {
    const db = await connectToDatabase();
    return db.collection('secondChanceItems');
}

function itemId(req, res) {
    if (!ObjectId.isValid(req.params.id)) {
        res.status(400).json({ error: 'Invalid item ID' });
        return null;
    }
    return new ObjectId(req.params.id);
}

// Mounted at /api/secondchance/items in app.js.
router.get('/', async (_req, res, next) => {
    try {
        const items = await (await collection()).find({}).toArray();
        res.json(items);
    } catch (error) { next(error); }
});

router.post('/', upload.single('file'), async (req, res, next) => {
    try {
        const item = { ...req.body };
        if (req.file) item.image = `/images/${req.file.filename}`;
        const result = await (await collection()).insertOne(item);
        logger.info({ id: result.insertedId }, 'Created item');
        res.status(201).json({ _id: result.insertedId, ...item });
    } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
    try {
        const _id = itemId(req, res);
        if (!_id) return;
        const item = await (await collection()).findOne({ _id });
        if (!item) return res.status(404).json({ error: 'Item not found' });
        res.json(item);
    } catch (error) { next(error); }
});

router.put('/:id', async (req, res, next) => {
    try {
        const _id = itemId(req, res);
        if (!_id) return;
        const { _id: ignored, ...changes } = req.body;
        if (!Object.keys(changes).length) return res.status(400).json({ error: 'No changes supplied' });
        const result = await (await collection()).findOneAndUpdate(
            { _id }, { $set: changes }, { returnDocument: 'after' });
        if (!result) return res.status(404).json({ error: 'Item not found' });
        res.json(result);
    } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const _id = itemId(req, res);
        if (!_id) return;
        const result = await (await collection()).deleteOne({ _id });
        if (!result.deletedCount) return res.status(404).json({ error: 'Item not found' });
        res.status(204).send();
    } catch (error) { next(error); }
});

module.exports = router;
