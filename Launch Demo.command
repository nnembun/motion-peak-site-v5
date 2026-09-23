#!/bin/bash
# MOTION PEAK V5 — local demo launcher
# Double-click this file to serve the site at http://localhost:4177
cd "$(dirname "$0")"
echo "Serving Motion Peak V5 at http://localhost:4177  (Ctrl+C to stop)"
open "http://localhost:4177"
python3 -m http.server 4177
