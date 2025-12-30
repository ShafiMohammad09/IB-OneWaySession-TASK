const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const cors = require('cors');

const app = express();
const port = 3000;

const SUBMISSIONS_FILE = path.join(__dirname, 'submissions.json');

app.use(cors());


const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});


const s3Client = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT,
    region: process.env.DO_SPACES_REGION,
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET
    }
});

app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        console.log('starting upload for:', req.file.originalname, 'Size:', req.file.size);

        const fileName = `recordings/${Date.now()}-${req.file.originalname}`;

        const command = new PutObjectCommand({
            Bucket: process.env.DO_SPACES_BUCKET,
            Key: fileName,
            Body: req.file.buffer,
            ACL: 'public-read',
            ContentType: req.file.mimetype
        });

        await s3Client.send(command);


        const publicUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/${fileName}`;

        console.log('Upload successful:', publicUrl);


        const submission = {
            url: publicUrl,
            timestamp: new Date().toISOString(),
            ...req.body
        };

        let submissions = [];
        if (fs.existsSync(SUBMISSIONS_FILE)) {
            try {
                const data = fs.readFileSync(SUBMISSIONS_FILE, 'utf8');
                submissions = JSON.parse(data);
            } catch (err) {
                console.error('Error reading submissions file:', err);
            }
        }

        submissions.push(submission);
        fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2));
        console.log('Submission saved to local JSON');

        res.status(200).json({
            message: 'Upload successful',
            url: publicUrl
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload video', details: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend proxy running at http://localhost:${port}`);
    console.log(`Target Bucket: ${process.env.DO_SPACES_BUCKET}`);
    console.log(`Region: ${process.env.DO_SPACES_REGION}`);
});
