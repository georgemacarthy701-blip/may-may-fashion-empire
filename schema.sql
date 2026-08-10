-- Create products table for May-May Fashion Empire
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    category TEXT DEFAULT 'General',
    image_urls TEXT[] NOT NULL, -- Array of high-resolution image URLs hosted on Cloudinary
    video_url TEXT,            -- Optional vertical promotional video URL hosted on Cloudinary
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for category-based searches and filtering
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Index for ordering products by creation date (as products are fetched DESC)
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
