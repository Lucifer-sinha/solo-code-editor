# 🚀 CollabRoom 3D Interactive Demo

A standalone, immersive 3D showcase for CollabRoom IDE built with React Three Fiber.

## ✨ Features

- 🎬 **Scroll-based storytelling** with 5 interactive scenes
- 💻 **Live code typing** animation (Monaco-style)
- 🖥️ **Terminal command replay** with CRT effects
- 🏗️ **3D architecture visualization** with Docker containers
- 💫 **100+ floating particles** with neon aesthetics
- 🌟 **Bloom post-processing** for cinematic glow
- 🎨 **Cyberpunk neon design** (cyan, magenta, green)
- 📊 **Real-time metrics** holograms

## 🎬 Experience Flow

### Scene 0 (0-20%): Hologram Cube Landing
- Floating holographic cube
- "Web IDE of the Future" title
- Orbiting particles

### Scene 1 (20-40%): Enter the Cube
- Camera zooms into the cube
- IDE panels appear (File Tree, Editor, Terminal)
- Neon borders glow

### Scene 2 (40-60%): Code Comes Alive
- Real-time typing animation
- Monaco editor simulation
- Terminal boots up

### Scene 3 (60-80%): Terminal Showcase
- Multiple terminals open
- Commands execute live
- Build, run, and log outputs

### Scene 4 (80-100%): Architecture Reveal
- 3D architecture diagram
- Docker containers floating
- Data packets flowing
- Metrics holograms

### Scene 5 (95-100%): Call to Action
- Logo formation from particles
- Action buttons
- Performance stats

## 🚀 Quick Start

### Installation

```bash
cd demo-showcase
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build

```bash
npm run build
```

### Preview Build

```bash
npm run preview
```

## 🛠️ Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Three.js** - 3D rendering
- **React Three Fiber** - React renderer for Three.js
- **@react-three/drei** - Useful helpers
- **@react-three/postprocessing** - Post-processing effects
- **GSAP** - Animation library
- **Vite** - Build tool

## 📁 Project Structure

```
demo-showcase/
├── src/
│   ├── components/
│   │   ├── IDEExperience.tsx          # Main experience controller
│   │   ├── HologramCube.tsx           # Landing hologram
│   │   ├── IDEPanels.tsx              # IDE panels
│   │   ├── MonacoPlayback.tsx         # Code typing animation
│   │   ├── TerminalPlayback.tsx       # Terminal replay
│   │   ├── ArchitectureDiagram.tsx    # 3D architecture
│   │   ├── FloatingParticles.tsx      # Particle system
│   │   ├── CTAScene.tsx               # Call-to-action
│   │   └── LoadingScreen.tsx          # Loading animation
│   ├── styles/
│   │   ├── index.css                  # Global styles
│   │   └── demo.css                   # Demo-specific styles
│   ├── App.tsx                        # Main app component
│   └── main.tsx                       # Entry point
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 🎨 Customization

### Change Colors

Edit `src/styles/demo.css`:

```css
/* Primary colors */
--cyan: #00f2ff;
--magenta: #ff00ff;
--green: #00ff88;
```

### Modify Code Content

Edit `src/components/MonacoPlayback.tsx`:

```typescript
const codeLines = [
  '// Your custom code',
  'import React from "react";',
  // Add more lines...
];
```

### Adjust Terminal Commands

Edit `src/components/TerminalPlayback.tsx`:

```typescript
const terminalCommands = [
  '$ your-command',
  '✓ Success!',
  // Add more commands...
];
```

### Change Scroll Speed

Edit `src/components/IDEExperience.tsx`:

```typescript
<ScrollControls pages={5} damping={0.1}>
  {/* Increase pages for slower scroll */}
  {/* Decrease damping for snappier feel */}
</ScrollControls>
```

## 🐛 Troubleshooting

### Black Screen?
- Check browser console for WebGL errors
- Enable hardware acceleration in browser settings
- Try a different browser (Chrome/Firefox recommended)

### Laggy Performance?
```typescript
// Reduce particles in FloatingParticles.tsx
<FloatingParticles count={50} /> // Instead of 100

// Disable bloom in App.tsx
// Comment out <EffectComposer> section
```

### Scroll Not Working?
- Ensure ScrollControls is properly set up
- Check that pages prop matches content
- Verify scroll container

## 📊 Performance

### Target Metrics
- **FPS:** 60fps on desktop
- **Load Time:** <3 seconds
- **Memory:** <200MB
- **CPU:** <50% usage

### Browser Support
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+

### Requirements
- WebGL 2.0 support
- Hardware acceleration enabled
- Modern GPU recommended

## 🎯 Use Cases

### For Demos
- Investor presentations
- User onboarding
- Product showcases
- Conference presentations

### For Marketing
- Website landing page
- Social media content
- Video recordings
- Email campaigns

### For Development
- Feature visualization
- Architecture documentation
- Team presentations
- Client demos

## 📝 License

MIT License - Feel free to use and modify!

## 🙏 Credits

Built with ❤️ using:
- React Three Fiber
- Three.js
- GSAP
- Vite

Inspired by:
- Marvel intro sequences
- Cyberpunk aesthetics
- Iron Man HUD

## 🚀 Deployment

### Vercel

```bash
npm install -g vercel
vercel
```

### Netlify

```bash
npm run build
# Drag and drop 'dist' folder to Netlify
```

### GitHub Pages

```bash
npm run build
# Deploy 'dist' folder to gh-pages branch
```

## 📞 Support

For issues or questions:
- Check the troubleshooting section
- Review browser console for errors
- Test in different browsers

## 🎉 Enjoy!

Experience the future of collaborative coding in 3D! 🚀✨

---

**Built by Ansh & Billu Cat 😼**
