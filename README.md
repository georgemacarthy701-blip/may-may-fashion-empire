# May-May Fashion Empire - Setup & Execution Guide

This guide provides step-by-step terminal instructions to install, run, test locally, and deploy the May-May Fashion Empire catalog and CMS platform.

---

## 1. Local Development Setup

### Step 1: Install Dependencies
Open your terminal, navigate to the project directory, and install the required Node.js packages:
```bash
cd may-may-fashion-empire
npm install
```

### Step 2: Configure Environment Variables
1. Copy the `.env.example` file to create a `.env` file:
   ```bash
   cp .env.example .env
   ```
2. Open the `.env` file and replace the placeholder values with your actual service credentials:
   - **Supabase**: Set up a new project in the Supabase Dashboard, create the `products` table using the SQL code in `schema.sql`, and paste your Project URL and Service Role Key (`service_role` secret key).
   - **Cloudinary**: Create a free account on Cloudinary, go to the dashboard, and copy your Cloud Name, API Key, and API Secret.
   - **Administrative Token**: Set a secure `ADMIN_SECRET_KEY` (e.g. `MayMaySuperSecretPassphrase123`). This key must be inputted on the admin screen to authorize uploads.
   - **WhatsApp Contact**: Specify the phone number in full international format (digits only, e.g. `23277777777` or `15551234567`) without spaces, dashes, or the `+` sign.

---

## 2. Database Schema Setup

1. In your **Supabase Dashboard**, navigate to the **SQL Editor** section.
2. Click **New Query**.
3. Copy the contents of the [`schema.sql`](file:///c:/Users/Alvin/Downloads/Compressed/SaloneBiz-main/may-may-fashion-empire/schema.sql) file and paste it into the editor.
4. Click **Run** to execute the script. This will create the `products` table and the indexes needed for high performance.

---

## 3. Running & Testing Locally

### Start the Server (Development Mode)
Run the server with the built-in file watcher:
```bash
npm run dev
```
The server will start at `http://localhost:3000`.

### Local Manual Testing
1. **Access Catalog Storefront**: Open `http://localhost:3000` in your web browser. You should see the skeleton loaders and then an empty catalog view.
2. **Access CMS Portal**: Open `http://localhost:3000/admin.html` in your browser.
3. **Publish a Product**:
   - Enter a title, price, and select a category.
   - Select up to 5 images.
   - (Optional) Select a vertical MP4 video loop.
   - Input your `ADMIN_SECRET_KEY` in the Secret Admin Access Key field.
   - Click **Publish Product**. You should see a success toast when the media finishes uploading and is stored in Supabase.
4. **Verify Storefront**: Return to the home catalog page `http://localhost:3000`. The new item will appear at the top, rendering the video loop (or image gallery) and building the WhatsApp order link!

---

## 4. Production Deployment

This project is built using a unified setup (Express API serving static HTML files) which makes deployment extremely straightforward.

### Option A: Deploying to Render (Recommended for Web Servers)
1. Commit the codebase to a GitHub/GitLab repository.
2. Log into [Render](https://render.com) and create a new **Web Service**.
3. Link your Git repository.
4. Configure the following service settings:
   - **Environment / Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. In the **Environment Variables** tab, add all variables defined in your `.env` file:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `ADMIN_SECRET_KEY`
   - `WHATSAPP_PHONE_NUMBER`
6. Click **Deploy**. Render will host the Express API and serve the static files on your public service URL.

### Option B: Deploying to Railway
1. Push your code to GitHub.
2. Go to [Railway](https://railway.app), create a new project, and select **Deploy from GitHub repo**.
3. Under **Variables**, add all environment variables.
4. Railway will automatically detect the Node.js project and deploy it.
