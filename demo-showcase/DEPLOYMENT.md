# 🚀 Deployment Guide - CollabRoom 3D Demo

Complete guide for deploying your 3D demo to various platforms.

## Pre-Deployment Checklist

- ✅ All features working locally
- ✅ Production build successful (`npm run build`)
- ✅ No console errors
- ✅ Performance optimized
- ✅ Assets compressed
- ✅ Environment variables configured

## Build for Production

```bash
npm run build
```

This creates an optimized build in `dist/` folder with:
- Minified JavaScript
- Optimized assets
- Source maps
- Compressed files

## Deployment Options

### 1. Vercel (Recommended) ⚡

**Why Vercel?**
- Zero configuration
- Automatic HTTPS
- Global CDN
- Instant deployments
- Free tier available

**Steps:**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Production deployment
vercel --prod
```

**Or use Vercel Dashboard:**

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import from Git
4. Deploy!

**Configuration:**

Create `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite"
}
```

### 2. Netlify 🌐

**Why Netlify?**
- Easy drag-and-drop
- Continuous deployment
- Form handling
- Serverless functions
- Free tier available

**Steps:**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy

# Production deployment
netlify deploy --prod
```

**Or use Netlify Dashboard:**

1. Go to [netlify.com](https://netlify.com)
2. Drag and drop `dist` folder
3. Done!

**Configuration:**

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 3. GitHub Pages 📄

**Why GitHub Pages?**
- Free hosting
- Custom domain support
- Integrated with GitHub
- Simple setup

**Steps:**

```bash
# Install gh-pages
npm install -D gh-pages

# Add to package.json scripts
"deploy": "npm run build && gh-pages -d dist"

# Deploy
npm run deploy
```

**Configuration:**

Update `vite.config.ts`:

```typescript
export default defineConfig({
  base: '/your-repo-name/',
  // ... rest of config
});
```

**Enable GitHub Pages:**

1. Go to repository Settings
2. Pages section
3. Source: gh-pages branch
4. Save

### 4. AWS S3 + CloudFront ☁️

**Why AWS?**
- Enterprise-grade
- Highly scalable
- Global CDN
- Full control

**Steps:**

```bash
# Install AWS CLI
# Follow: https://aws.amazon.com/cli/

# Build
npm run build

# Sync to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

**Configuration:**

Create `aws-deploy.sh`:

```bash
#!/bin/bash
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

### 5. Docker 🐳

**Why Docker?**
- Consistent environment
- Easy scaling
- Platform independent
- Kubernetes ready

**Create Dockerfile:**

```dockerfile
# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Create nginx.conf:**

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

**Build and Run:**

```bash
# Build image
docker build -t collabroom-demo .

# Run container
docker run -p 80:80 collabroom-demo

# Push to registry
docker tag collabroom-demo your-registry/collabroom-demo
docker push your-registry/collabroom-demo
```

### 6. Firebase Hosting 🔥

**Why Firebase?**
- Google infrastructure
- Free SSL
- CDN included
- Easy CLI

**Steps:**

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init hosting

# Deploy
firebase deploy
```

**Configuration:**

Create `firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## Custom Domain Setup

### Vercel

1. Go to Project Settings
2. Domains tab
3. Add your domain
4. Update DNS records

### Netlify

1. Go to Domain Settings
2. Add custom domain
3. Update DNS records

### Cloudflare (Recommended for CDN)

1. Add site to Cloudflare
2. Update nameservers
3. Enable CDN and optimizations
4. Configure SSL

## Environment Variables

### Production Variables

Create `.env.production`:

```env
VITE_API_URL=https://api.yoursite.com
VITE_ANALYTICS_ID=your-analytics-id
VITE_SENTRY_DSN=your-sentry-dsn
```

### Platform-Specific

**Vercel:**
```bash
vercel env add VITE_API_URL production
```

**Netlify:**
```bash
netlify env:set VITE_API_URL "https://api.yoursite.com"
```

## Performance Optimization

### 1. Enable Compression

**Vite Config:**

```typescript
import compression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    compression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ],
});
```

### 2. Image Optimization

```bash
npm install -D vite-plugin-imagemin

# Add to vite.config.ts
import viteImagemin from 'vite-plugin-imagemin';

plugins: [
  viteImagemin({
    gifsicle: { optimizationLevel: 7 },
    optipng: { optimizationLevel: 7 },
    mozjpeg: { quality: 80 },
  })
]
```

### 3. Code Splitting

```typescript
// Lazy load heavy components
const HeavyComponent = lazy(() => import('./HeavyComponent'));
```

### 4. CDN for Assets

Use CDN for Three.js and other large libraries:

```html
<!-- In index.html -->
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
```

## Monitoring & Analytics

### 1. Google Analytics

```bash
npm install @vercel/analytics

# Add to App.tsx
import { Analytics } from '@vercel/analytics/react';
<Analytics />
```

### 2. Sentry Error Tracking

```bash
npm install @sentry/react

# Initialize in main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-dsn",
  environment: "production",
  tracesSampleRate: 1.0,
});
```

### 3. Performance Monitoring

```typescript
// Add to App.tsx
useEffect(() => {
  // Log performance metrics
  if (window.performance) {
    const perfData = window.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
    console.log('Page load time:', pageLoadTime);
  }
}, []);
```

## Security

### 1. Content Security Policy

Add to `index.html`:

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline' 'unsafe-eval'; 
               style-src 'self' 'unsafe-inline';">
```

### 2. HTTPS Only

Ensure all platforms use HTTPS (most do by default).

### 3. Environment Variables

Never commit `.env` files. Use platform-specific secret management.

## CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install
        
      - name: Build
        run: npm run build
        
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

## Rollback Strategy

### Vercel

```bash
# List deployments
vercel ls

# Rollback to previous
vercel rollback [deployment-url]
```

### Netlify

```bash
# List deployments
netlify deploy:list

# Restore deployment
netlify deploy:restore [deploy-id]
```

## Testing Production Build

```bash
# Build
npm run build

# Preview locally
npm run preview

# Test checklist:
# ✅ All scenes load
# ✅ Scroll works
# ✅ No console errors
# ✅ Performance is good
# ✅ Mobile responsive
```

## Post-Deployment

### 1. Verify Deployment

- ✅ Visit production URL
- ✅ Test all features
- ✅ Check mobile view
- ✅ Test different browsers
- ✅ Verify analytics working

### 2. Monitor Performance

- Check Lighthouse score
- Monitor error rates
- Track user engagement
- Review load times

### 3. SEO Optimization

```html
<!-- Add to index.html -->
<meta name="description" content="Experience CollabRoom IDE in 3D">
<meta property="og:title" content="CollabRoom 3D Demo">
<meta property="og:description" content="Interactive 3D showcase">
<meta property="og:image" content="/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
```

## Troubleshooting

### Build Fails

```bash
# Clear cache
rm -rf node_modules dist
npm install
npm run build
```

### Deployment Fails

- Check build logs
- Verify environment variables
- Test build locally
- Check platform status

### Performance Issues

- Enable compression
- Optimize images
- Use CDN
- Reduce particle count

## Cost Estimation

### Free Tier Limits

**Vercel:**
- 100GB bandwidth/month
- Unlimited deployments
- Free SSL

**Netlify:**
- 100GB bandwidth/month
- 300 build minutes/month
- Free SSL

**GitHub Pages:**
- 100GB bandwidth/month
- 100GB storage
- Free SSL

## Success Checklist

- ✅ Production build successful
- ✅ Deployed to platform
- ✅ Custom domain configured
- ✅ HTTPS enabled
- ✅ Analytics integrated
- ✅ Error tracking setup
- ✅ Performance optimized
- ✅ SEO configured
- ✅ Monitoring active
- ✅ Backup strategy in place

## Next Steps

1. 🚀 Deploy to production
2. 📊 Monitor performance
3. 🎨 Gather user feedback
4. 🔄 Iterate and improve
5. 📈 Scale as needed

---

**Your 3D demo is now live! 🎉**

**Share it with the world! 🌍**
