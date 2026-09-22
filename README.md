# MAFIA WARS 🔫
**A browser-based multiplayer social deduction game**

Created by **pakball13** | Art & Concept: **Mr_Deviljinkazama** and others

---

## 📁 File Structure
```
mafia-wars/
├── index.html        ← Lobby / starting page
├── credits.html      ← Scrolling credits page
├── game.html         ← In-game screen
├── api.php           ← PHP multiplayer backend
├── css/
│   ├── style.css     ← Lobby styles
│   ├── credits.css   ← Credits styles
│   └── game.css      ← Game styles
├── js/
│   ├── app.js        ← Lobby logic + identity
│   ├── credits.js    ← Credits scroll animation
│   └── game.js       ← Game phase logic
└── data/
    └── gamestate.json  ← Auto-created by PHP
```

---

## 🚀 Hosting

### ⚠️ NETLIFY DOES NOT SUPPORT PHP
Netlify is a static host. PHP won't run there.

### ✅ Works on:
| Host | Free Tier |
|------|-----------|
| [InfinityFree](https://infinityfree.com) | ✅ Yes |
| [000webhost](https://000webhost.com) | ✅ Yes |
| [Railway.app](https://railway.app) | ✅ Limited |
| [Render.com](https://render.com) | ✅ Limited |
| Any cPanel / shared hosting | ✅ Yes |

### 🔧 Setup Steps
1. Upload ALL files to your PHP server
2. Make `data/` folder writable:
   ```bash
   chmod 755 data/
   ```
3. Open `index.html` in your browser
4. The **first person** to open the page becomes the **host**
5. Share the URL — friends join automatically

---

## 🎮 How to Play

### Lobby
- Enter your **codename** and **motto** (first visit only)
- Wait for players — the list updates every 2 seconds
- Host clicks **START** when ready (min 4 players — bots fill the rest)

### Roles (Current)
| Role | Count | Ability |
|------|-------|---------|
| **MAFIA** | 1 (6 players) / 2 (8+ players) | Kill one person each night |
| **CIVILIAN** | Everyone else | Vote to eliminate suspects |

### Night Phase
- **Civilians** see: *Night, Night* — sit tight
- **Mafia** see: *EVERYONE'S ASLEEP — STRIKE NOW!* — pick a victim (20s timer)

### Morning Phase (15s)
- Narrator reveals who was killed (not who did it)

### Voting Phase (30s)
- All players vote to eliminate a suspect
- Most votes wins — ties are broken randomly
- Bots auto-vote

### Win Conditions
- 🏆 **Civilians Win** — All mafia eliminated
- 💀 **Mafia Wins** — Mafia ≥ remaining civilians

---

## 🎴 Future Roles (Coming Soon)
- **Doctor** — Protect one person per night
- **Detective** — Ask 3 players if they're mafia
- **Grandma** — Invincible & can kill mafia
- **Mafia Boss** — ???
- **Shapeshifter** — ???

---

*AI was used in the creation of this game (Claude by Anthropic)*
