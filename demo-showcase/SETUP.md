# 🚀 Setup Guide - CollabRoom 3D Demo

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ installed
- **npm** or **yarn** package manager
- Modern browser (Chrome, Firefox, Edge, Safari)
- GPU with WebGL 2.0 support

## Installation Steps

### 1. Navigate to Project

```bash
cd demo-showcase
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- React 18.2.0
- Three.js 0.160.0
- @react-three/fiber 8.15.0
- @react-three/drei 9.96.0
- @react-three/postprocessing 2.16.0
- GSAP 3.12.5
- TypeScript 5.2.2
- Vite 5.0.8

### 3. Start Development Server

```bash
npm run dev
```

The demo will open automatically at `http://localhost:3000`

## Verification

### Check Installation

```bash
# Verify Node.js version
node --version  # Should be 18+

# Verify npm version
npm --version   # Should be 9+

# List installed packages
npm list --depth=0
```

### Test the Demo

1. Open `http://localhost:3000` in your browser
2. You should see a loading screen
3. After loading, you'll see the hologram cube
4. Scroll down to experience all 5 scenes

## Build for Production

### Create Production Build

```bash
npm run build
```

This creates an optimized build in the `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

Opens the production build at `http://localhost:4173`

## Troubleshooting

### Installation Issues

#### Problem: npm install fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

#### Problem: Peer dependency warnings

**Solution:**
```bash
# Use legacy peer deps
npm install --legacy-peer-deps
```

### Runtime Issues

#### Problem: Black screen on load

**Checklist:**
- ✅ Check browser console for errors
- ✅ Enable hardware acceleration
- ✅ Update graphics drivers
- ✅ Try different browser

**Solution:**
```bash
# Check if WebGL is supported
# Visit: https://get.webgl.org/
```

#### Problem: Laggy performance

**Solution:**
```typescript
// Edit src/components/FloatingParticles.tsx
// Reduce particle count
<FloatingParticles count={50} /> // Instead of 100

// Edit src/App.tsx
// Disable bloom effect (comment out EffectComposer)
```

#### Problem: Scroll not working

**Solution:**
- Ensure you're scrolling within the canvas area
- Check browser console for errors
- Try refreshing the page

### Build Issues

#### Problem: Build fails with TypeScript errors

**Solution:**
```bash
# Check TypeScript version
npx tsc --version

# Run type check
npm run build
```

#### Problem: Out of memory during build

**Solution:**
```bash
# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

## Development Tips

### Hot Module Replacement

Vite provides instant HMR. Changes to components will reflect immediately without full page reload.

### Debug Mode

Add to `src/App.tsx`:

```typescript
// Enable stats
import { Stats } from '@react-three/drei';

// In Canvas
<Stats />
```

### Performance Monitoring

```typescript
// Add FPS counter
useFrame((state) => {
  console.log('FPS:', 1 / state.clock.getDelta());
});
```

## Environment Variables

Create `.env` file in root:

```env
# Development
VITE_API_URL=http://localhost:3000

# Production
VITE_API_URL=https://your-api.com
```

Access in code:

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

## IDE Setup

### VS Code

Recommended extensions:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## Git Setup

### .gitignore

Already included:

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
```

### Initialize Git

```bash
git init
git add .
git commit -m "Initial commit: CollabRoom 3D Demo"
```

## Deployment

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

### Netlify

```bash
# Build
npm run build

# Deploy dist folder
netlify deploy --prod --dir=dist
```

### GitHub Pages

```bash
# Install gh-pages
npm install -D gh-pages

# Add to package.json scripts
"deploy": "npm run build && gh-pages -d dist"

# Deploy
npm run deploy
```

## Performance Optimization

### Code Splitting

Vite automatically code-splits. For manual splitting:

```typescript
// Lazy load components
const HeavyComponent = lazy(() => import('./HeavyComponent'));
```

### Asset Optimization

```bash
# Optimize images
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

### Bundle Analysis

```bash
# Install analyzer
npm install -D rollup-plugin-visualizer

# Add to vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  visualizer({ open: true })
]

# Build and analyze
npm run build
```

## Testing

### Unit Tests (Optional)

```bash
# Install testing libraries
npm install -D vitest @testing-library/react @testing-library/jest-dom

# Add test script to package.json
"test": "vitest"

# Run tests
npm test
```

### E2E Tests (Optional)

```bash
# Install Playwright
npm install -D @playwright/test

# Run tests
npx playwright test
```

## Monitoring

### Error Tracking

```bash
# Install Sentry
npm install @sentry/react

# Initialize in main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-dsn",
  environment: import.meta.env.MODE,
});
```

### Analytics

```bash
# Install analytics
npm install @vercel/analytics

# Add to App.tsx
import { Analytics } from '@vercel/analytics/react';

<Analytics />
```

## Next Steps

1. ✅ Installation complete
2. ✅ Development server running
3. ✅ Demo working
4. 🎨 Customize colors and content
5. 🚀 Deploy to production
6. 📊 Add analytics
7. 🎉 Share with the world!

## Support

### Documentation
- [README.md](./README.md) - Main documentation
- [Vite Docs](https://vitejs.dev/)
- [React Three Fiber Docs](https://docs.pmnd.rs/react-three-fiber/)

### Community
- GitHub Issues
- Discord
- Stack Overflow

## Success! 🎉

Your CollabRoom 3D Demo is now set up and ready to go!

**Next:** Start customizing and make it yours! 🚀

---

**Happy Coding! 😼**
