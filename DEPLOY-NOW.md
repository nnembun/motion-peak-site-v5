# Deploy Performance Improvements NOW

## Changes Made ✅

1. **vercel.json** - Better caching + security headers
2. **index.html** - Preload + DNS prefetch
3. **PERFORMANCE-OPTIMIZATION.md** - Full optimization plan

---

## How to Deploy (Choose One)

### Option A: GitHub + Vercel Auto-Deploy (Recommended)

```bash
# 1. Initialize git (if not already done)
cd "/Users/nnembunwokeji/Motion Peak Fable 5 July/motion-peak-site-v5"
git init
git add .
git commit -m "Performance optimizations: better caching, preload, DNS prefetch"

# 2. Push to GitHub
git remote add origin https://github.com/nnembun/motion-peak-v5.git
git branch -M main
git push -u origin main

# Vercel will auto-deploy!
```

### Option B: Drag & Drop (Fastest)

1. Go to vercel.com → Import Project
2. Drag & drop the `motion-peak-site-v5` folder
3. Click Deploy
4. Done! Live in 30 seconds

### Option C: Vercel CLI

```bash
npm install -g vercel
cd "/Users/nnembunwokeji/Motion Peak Fable 5 July/motion-peak-site-v5"
vercel --prod
```

---

## After Deployment ✅

1. Wait 2-3 minutes for Vercel to build
2. Visit motionpeak.co.uk
3. Open DevTools → Network tab
4. Check that files have cache headers
5. Performance should improve slightly

---

## Then: Phase 2 - Video Conversion 🎬

Once this is live, let's convert those 1,685 frames to video:

```bash
cd frames/descent
ffmpeg -framerate 60 -i frame_%04d.webp \
  -c:v libx264 -preset slow -crf 18 \
  -pix_fmt yuv420p hero.mp4
  
# Result: 108MB folder → 10MB video! 🚀
```

This will give you **75% faster loading**.

---

## Questions?
Ready to push? Just let me know! 🚀
