const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { v2: cloudinary } = require('cloudinary');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage — we stream the buffer directly to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
});

// Auth middleware
const authenticate = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * POST /api/upload
 * Multipart file upload → Cloudinary
 * Returns { url, publicId, mimeType, filename, size, resourceType }
 */
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, mimetype, size, buffer } = req.file;

    // Determine Cloudinary resource_type
    let resourceType = 'auto';
    if (mimetype.startsWith('image/')) resourceType = 'image';
    else if (mimetype === 'application/pdf') resourceType = 'image'; // PDFs work better as 'image' in Cloudinary
    else if (mimetype.startsWith('video/')) resourceType = 'video';
    else if (mimetype.startsWith('audio/')) resourceType = 'video'; // Cloudinary treats audio as 'video'
    else resourceType = 'raw'; // PPTX, DOCX, etc.

    // Generate public_id (strip extension for image/video/pdf, keep for raw)
    const timestamp = Date.now();
    const cleanName = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dotIndex = cleanName.lastIndexOf('.');
    const nameWithoutExtension = dotIndex > 0 ? cleanName.substring(0, dotIndex) : cleanName;
    const publicId = resourceType === 'raw' ? `${timestamp}_${cleanName}` : `${timestamp}_${nameWithoutExtension}`;

    // Upload via stream
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'vaani/media',
          resource_type: resourceType,
          public_id: publicId,
          // For raw files, keep original filename extension
          use_filename: true,
          unique_filename: false,
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(buffer);
    });

    return res.status(200).json({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      mimeType: mimetype,
      filename: originalname,
      size,
      resourceType: uploadResult.resource_type,
    });
  } catch (err) {
    console.error('[Upload] Cloudinary upload error:', err);
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

module.exports = router;
