# Netlify Deployment Guide

This project is now configured for Netlify deployment with WASM support.

## What Was Changed

The application **already uses WebAssembly (WASM)** through the FFmpeg library (`@ffmpeg/ffmpeg`), which loads WASM files from the unpkg.com CDN. The issue with Netlify was not about WASM compatibility, but rather proper deployment configuration.

### Changes Made:

1. **Added `netlify.toml`** - Netlify build and deployment configuration:
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Headers for WASM content type
   - SPA redirect rules

2. **Added `public/_headers`** - Static headers for WASM and asset files:
   - Proper WASM MIME type (`application/wasm`)
   - Security headers
   - Cache control headers

3. **Updated `vite.config.ts`** - Optimized build configuration:
   - Excluded FFmpeg libraries from optimization (they include WASM)
   - Added CORS headers for development server
   - Manual code chunking to reduce bundle size
   - SharedArrayBuffer headers for FFmpeg WASM

## Deploying to Netlify

### Option 1: Connect via Netlify Dashboard (Recommended)

1. Go to [Netlify](https://app.netlify.com/)
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repository
4. **IMPORTANT**: Netlify will auto-detect the settings from `netlify.toml`:
   - Base directory: `particle-studio`
   - Build command: `npm install && npm run build`
   - Publish directory: `dist` (relative to base directory)
5. Click "Deploy site"

**Note**: If you get a 404 error after deployment, make sure:
- The base directory is set to `particle-studio` in Netlify's build settings
- The publish directory is set to `dist` (not `particle-studio/dist`)
- The `_redirects` file is present in the published output

### Option 2: Manual Deploy

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Navigate to the project directory
cd particle-studio

# Login to Netlify
netlify login

# Deploy
netlify deploy --prod
```

## Technical Details

### WASM Usage

This application uses WASM through:
- **@ffmpeg/ffmpeg** (v0.12.15) - For video encoding/processing
- **FFmpeg WASM Core** (v0.12.6) - Loaded from unpkg.com CDN

The FFmpeg WASM files are loaded dynamically from:
```
https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/
```

### Browser Requirements

- Modern browser with WASM support (all modern browsers)
- SharedArrayBuffer support (enabled via CORS headers)
- Canvas API support
- MediaRecorder API support

### Performance Notes

- First load downloads FFmpeg WASM (~25MB) - cached after first use
- Video export requires FFmpeg initialization (one-time per session)
- Large video exports may take time depending on duration and quality

## Troubleshooting

### 404 "Page not found" Error

If you get a 404 error on Netlify after deployment:

1. **Check Base Directory**: In Netlify's Site settings → Build & deploy → Build settings:
   - Base directory should be: `particle-studio`
   - Publish directory should be: `dist`
   - Build command should be: `npm install && npm run build`

2. **Verify `netlify.toml`**: The `netlify.toml` file should be at the **repository root** (not inside particle-studio), with:
   ```toml
   [build]
     base = "particle-studio"
     publish = "dist"
   ```

3. **Check `_redirects` file**: Verify that `particle-studio/public/_redirects` exists with:
   ```
   /*    /index.html   200
   ```
   This file should be copied to the `dist` folder during build.

4. **Redeploy**: After making changes, trigger a new deploy:
   - Go to Deploys → Trigger deploy → Clear cache and deploy site

### WASM Loading Issues

If FFmpeg fails to load:
1. Check browser console for CORS errors
2. Ensure the unpkg.com CDN is accessible
3. Verify browser supports SharedArrayBuffer

### Build Failures

If build fails on Netlify:
1. Check Node version (should be 18+)
2. Verify all dependencies are listed in package.json
3. Check build logs for specific errors

### MIME Type Errors

If you see "incorrect MIME type" errors for WASM:
1. Verify `_headers` file is in the `public` directory
2. Check that `netlify.toml` headers are configured
3. Clear browser cache and try again

## Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Additional Resources

- [Netlify Documentation](https://docs.netlify.com/)
- [FFmpeg.wasm Documentation](https://github.com/ffmpegwasm/ffmpeg.wasm)
- [Vite Documentation](https://vitejs.dev/)
