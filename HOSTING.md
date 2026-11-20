# HEARTLAND 26 — Free Multiplayer Hosting Guide

HEARTLAND 26 includes a **Triple-Transport Multiplayer Engine** (`js/multiplayer.js` + `server.js`) so you can host multiplayer sessions with **45m Proximity Voice Chat** for **$0/month** in four ways:

---

## Option 1: 100% Free Static Hosting + Built-in Global WebRTC P2P (GitHub Pages / Cloudflare Pages / Netlify)
Even without running a Node.js server, HEARTLAND 26 includes a **Serverless Global WebRTC P2P Room Mesh** (powered by WebRTC DataChannels + public PeerJS signaling & Google STUN servers).

1. Push or drag-and-drop this project folder to any free static host:
   - **GitHub Pages** (`Settings -> Pages -> Deploy from branch`)
   - **Cloudflare Pages** or **Netlify Drop** (`app.netlify.com/drop`)
   - **Vercel** or **itch.io**
2. Open your live URL, click **MULTIPLAYER SESSION**, and choose a Room Code (e.g. `KC-2026`).
3. Click **`🔗 COPY INVITE LINK`** (`https://your-site.example/?room=KC-2026`) and send it to friends anywhere.
4. The first player in a room code becomes the **P2P Room Host** (`GLOBAL P2P HOST`), and all friends who open your invite link connect directly via WebRTC DataChannels!

---

## Option 2: Free Cloud WebSocket Server (Render.com / Koyeb / Fly.io Free Tier)
To host the dedicated Node.js HTTP + WebSocket server (`server.js`) in the cloud 24/7 for free:

1. Push this repo to GitHub.
2. Go to [Render.com](https://render.com) -> **New +** -> **Blueprint** (or **Web Service**) and select your repo.
3. Render automatically detects `render.yaml` (`plan: free`, `startCommand: node server.js`, `healthCheckPath: /healthz`).
4. Once deployed, share `https://your-app.onrender.com/?room=KC-2026` — all players sync over `wss://` WebSockets + P2P fallback!

---

## Option 3: Instant Free Public Tunnel from Your PC (No Account Needed)
Want friends across the internet to join the server running on your own computer right now?

1. Start the game server:
   ```bash
   npm start
   ```
2. In a second terminal, expose port `8080` over a free public HTTPS/WSS tunnel:
   - **Cloudflare Quick Tunnel (Recommended, fast & free):**
     ```bash
     npm run host:cloudflare
     ```
   - **Or LocalTunnel:**
     ```bash
     npm run host:tunnel
     ```
3. Copy the generated `https://....trycloudflare.com` (or `.loca.lt`) URL, append `/?room=KC-2026`, and send it to your friends!

---

## Option 4: Local Wi-Fi / LAN Party
When you run `node server.js`, it binds to `0.0.0.0:8080` and automatically detects your local LAN IP (displayed in the terminal and inside the in-game **SESSIONS** modal):
- Anyone on the same Wi-Fi/LAN can open `http://<YOUR-LAN-IP>:8080/?room=KC-2026` in their browser to join immediately.
