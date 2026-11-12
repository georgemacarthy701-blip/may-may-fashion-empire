require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('Warning: Supabase environment variables are missing. The app will still serve the storefront, but product APIs will fail until they are provided.');
}

const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer memory storage
// Limit files to 5 images and 1 video. Files are stored in memory buffers.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit to handle high-quality videos
  }
}).fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 }
]);

/**
 * Middleware: Header Token Authorization Checking
 * Checks for a Bearer token in the Authorization header.
 * Enforces process.env.ADMIN_SECRET_KEY for POST write requests.
 * Allows process.env.ADMIN_SECRET_KEY OR a public token for GET requests.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers['x-admin-key'];
  const token = authHeader ? authHeader.replace('Bearer ', '').trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token.' });
  }

  const adminSecret = (process.env.ADMIN_SECRET_KEY || '').trim();
  if (token === adminSecret) {
    return next();
  }

  // For GET requests, we also allow a public client key to prevent abuse of the API
  const publicClientKey = (process.env.PUBLIC_CLIENT_KEY || 'public-viewer-key').trim();
  if (req.method === 'GET' && token === publicClientKey) {
    return next();
  }

  return res.status(403).json({ error: 'Forbidden: Invalid authorization token.' });
};

/**
 * Helper to upload a buffer to Cloudinary using upload_stream
 * Utilizes auto-quality and auto-format settings for compression and performance.
 */
const uploadToCloudinary = (fileBuffer, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'may_may_fashion',
      resource_type: resourceType,
      quality: 'auto',
      fetch_format: 'auto'
    };

    // For videos, specify video-specific low-latency streaming configurations
    if (resourceType === 'video') {
      uploadOptions.video_codec = 'auto';
    }

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve(result.secure_url);
    });

    stream.end(fileBuffer);
  });
};

/**
 * API Route: GET /api/products
 * Fetches all product records ordered by created_at DESC.
 * Secured via authenticate middleware.
 */
app.get('/api/products', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Set custom header with the WhatsApp phone number from environment
    res.setHeader('x-whatsapp-phone', process.env.WHATSAPP_PHONE_NUMBER || '');
    res.setHeader('Access-Control-Expose-Headers', 'x-whatsapp-phone');

    res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve products.', 
      error: err.message 
    });
  }
});

/**
 * API Route: POST /api/products/create
 * Handles multipart product creation:
 * 1. File uploads streamed to Cloudinary
 * 2. Product metadata registration in Supabase
 * Secured via authenticate middleware (Admin token required).
 */
app.post('/api/products/create', authenticate, upload, async (req, res) => {
  try {
    const { title, price, category } = req.body;
    
    // Validation
    if (!title || !price) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: title and price are required.' 
      });
    }

    const files = req.files || {};
    const imageFiles = files['images'] || [];
    const videoFiles = files['video'] || [];

    if (imageFiles.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one product image is required.' 
      });
    }

    console.log(`Starting media upload for product: "${title}"`);

    // 1. Upload Images to Cloudinary in parallel
    const uploadImagesPromises = imageFiles.map(file => 
      uploadToCloudinary(file.buffer, 'image')
    );
    const imageUrls = await Promise.all(uploadImagesPromises);

    // 2. Upload Video to Cloudinary if present
    let videoUrl = null;
    if (videoFiles.length > 0) {
      console.log('Uploading vertical product video loop...');
      videoUrl = await uploadToCloudinary(videoFiles[0].buffer, 'video');
    }

    // 3. Save Product Record to Supabase
    const { data, error } = await supabase
      .from('products')
      .insert([
        {
          title: title.trim(),
          price: parseFloat(price),
          category: (category || 'General').trim(),
          image_urls: imageUrls,
          video_url: videoUrl
        }
      ])
      .select();

    if (error) {
      throw error;
    }

    console.log('Product created successfully and metadata registered in Supabase.');
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product: data[0]
    });

  } catch (err) {
    console.error('Error creating product:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server failed to process and create product.', 
      error: err.message 
    });
  }
});

/**
 * Cloudinary URL parser to extract public ID for media deletion.
 */
const getPublicIdFromUrl = (url) => {
  try {
    if (!url) return null;
    const uploadIdx = url.indexOf('/upload/');
    if (uploadIdx === -1) return null;
    
    const afterUpload = url.substring(uploadIdx + 8);
    const parts = afterUpload.split('/');
    if (parts[0].match(/^v\d+$/)) {
      parts.shift(); // Remove version segment
    }
    
    const pathAndFilename = parts.join('/');
    const dotIdx = pathAndFilename.lastIndexOf('.');
    if (dotIdx !== -1) {
      return pathAndFilename.substring(0, dotIdx);
    }
    return pathAndFilename;
  } catch (e) {
    console.error('Error parsing Cloudinary URL:', e);
    return null;
  }
};

/**
 * Deletes media file from Cloudinary CDN.
 */
const deleteFromCloudinary = async (url, resourceType = 'image') => {
  const publicId = getPublicIdFromUrl(url);
  if (!publicId) return;
  try {
    console.log(`Cloudinary Cleanup: Deleting ${publicId} (${resourceType})`);
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (error) {
    console.error(`Failed to delete asset ${publicId} from Cloudinary:`, error.message);
  }
};

/**
 * API Route: PUT /api/products/:id
 * Updates an existing product details, including text and media overrides.
 * Cleans up orphaned images/videos in Cloudinary automatically.
 * Secured via authenticate middleware (Admin token required).
 */
app.put('/api/products/:id', authenticate, upload, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, price, category, existing_image_urls, remove_video } = req.body;
    
    if (!title || !price) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: title and price are required.' 
      });
    }

    // 1. Fetch current product to check existence and retrieve current media paths
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // 2. Parse existing images kept by user
    let keptImageUrls = [];
    if (existing_image_urls) {
      try {
        keptImageUrls = JSON.parse(existing_image_urls);
      } catch (e) {
        keptImageUrls = [];
      }
    } else {
      keptImageUrls = product.image_urls || [];
    }

    // 3. Clean up deleted images in Cloudinary
    const deletedImages = (product.image_urls || []).filter(url => !keptImageUrls.includes(url));
    deletedImages.forEach(url => deleteFromCloudinary(url, 'image'));

    // 4. Upload new files if present
    const files = req.files || {};
    const newImageFiles = files['images'] || [];
    const newVideoFiles = files['video'] || [];

    const uploadPromises = newImageFiles.map(file => uploadToCloudinary(file.buffer, 'image'));
    const newImageUrls = await Promise.all(uploadPromises);
    
    const finalImageUrls = [...keptImageUrls, ...newImageUrls];

    if (finalImageUrls.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one product image is required.' });
    }
    if (finalImageUrls.length > 5) {
      return res.status(400).json({ success: false, message: 'A maximum of 5 images is allowed.' });
    }

    // 5. Handle video update
    let videoUrl = product.video_url;

    if (newVideoFiles.length > 0) {
      // Clean up previous video
      if (product.video_url) {
        deleteFromCloudinary(product.video_url, 'video');
      }
      videoUrl = await uploadToCloudinary(newVideoFiles[0].buffer, 'video');
    } else if (remove_video === 'true') {
      // Clean up previous video and clear DB entry
      if (product.video_url) {
        deleteFromCloudinary(product.video_url, 'video');
      }
      videoUrl = null;
    }

    // 6. Update database record in Supabase
    const { data, error: updateError } = await supabase
      .from('products')
      .update({
        title: title.trim(),
        price: parseFloat(price),
        category: (category || 'General').trim(),
        image_urls: finalImageUrls,
        video_url: videoUrl
      })
      .eq('id', id)
      .select();

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product: data[0]
    });

  } catch (err) {
    console.error('Error updating product:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server failed to process and update product.', 
      error: err.message 
    });
  }
});

/**
 * API Route: DELETE /api/products/:id
 * Removes a product from database and cleans up associated Cloudinary files.
 * Secured via authenticate middleware (Admin token required).
 */
app.delete('/api/products/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch details to retrieve media links
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // 2. Asynchronously delete assets from Cloudinary in the background
    const deletePromises = [];
    if (product.image_urls && Array.isArray(product.image_urls)) {
      product.image_urls.forEach(url => {
        deletePromises.push(deleteFromCloudinary(url, 'image'));
      });
    }
    if (product.video_url) {
      deletePromises.push(deleteFromCloudinary(product.video_url, 'video'));
    }

    // Log any async Cloudinary deletion issues in background without blocking API
    Promise.all(deletePromises).catch(err => console.error('Cloudinary cleanup error:', err));

    // 3. Delete DB record
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (err) {
    console.error('Error deleting product:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'Server failed to delete product.', 
      error: err.message 
    });
  }
});

// Explicit routes to serve static HTML pages from the public directory
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/about.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));

// Fallback to serving the catalog page for other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` May-May Fashion Empire API Server Running`);
  console.log(` Port: ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`==================================================`);
});
