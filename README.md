# Flying Head Game

A custom 2D Flappy-style browser game built with HTML, CSS and JavaScript.

## Included features

- Your supplied start-screen, flying-head and Game Over images.
- Your three supplied music clips:
  - `start.mp3`: plays once when Start Game is clicked.
  - `gameplay.mp3`: loops during gameplay, after the start clip ends.
  - `game-over.mp3`: loops while the Game Over screen is visible.
- No flap, collision, point or other sound effects.
- Desktop keyboard and mobile touch controls.
- Local personal-best score.
- Supabase anonymous player profiles, saved scores and global top-10 leaderboard.
- Ready for GitHub + Vercel deployment.

## 1. Run locally in VS Code

1. Extract this ZIP file.
2. Open the `flying-head-game` folder in VS Code.
3. Install the **Live Server** extension.
4. Right-click `index.html` and select **Open with Live Server**.

Do not open `index.html` by double-clicking it. The game uses JavaScript modules and should run from a local web server.

The game can be played without Supabase, but online player profiles and the global leaderboard need the setup below.

## 2. Set up Supabase

1. Create a project at https://supabase.com.
2. Open **Authentication → Providers** and enable **Anonymous Sign-Ins**.
3. Open **SQL Editor**, create a new query, paste all of `supabase/schema.sql`, and run it.
4. Open **Project Settings → API** (or API Keys).
5. Copy the Project URL and the **anon/public** key (not the service-role/secret key).
6. Open `js/supabase-config.js` and replace the two placeholder values:

```js
export const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_PUBLIC_KEY";
```

Never put a Supabase service-role key in frontend code or GitHub.

### Database behavior

- `players` stores each anonymous player's username, best score and games played.
- `scores` stores each completed game score with a timestamp.
- The leaderboard reads the top 10 `players` ordered by best score.
- Row Level Security policies limit profile updates and score inserts to the signed-in anonymous player.

For a production competitive leaderboard, add server-side score validation (for example, a Supabase Edge Function) so users cannot submit fabricated scores by modifying browser requests. The current version is suitable as a portfolio/demo implementation, not cheat-proof.

## 3. Deploy with GitHub and Vercel

1. Create a GitHub repository, for example `flying-head-game`.
2. In the project folder, run:

```bash
git init
git add .
git commit -m "Build customized Flying Head game"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/flying-head-game.git
git push -u origin main
```

3. Sign in to https://vercel.com and choose **Add New → Project**.
4. Import your GitHub repository.
5. Framework preset: **Other**. Build command: leave empty. Output directory: `.` (project root).
6. Deploy. Every push to the connected GitHub branch will trigger a new deployment.

No environment variables are needed for this static version because the Supabase browser config is in `js/supabase-config.js`. If you prefer Vercel environment variables later, we can change the setup.

## 4. Asset locations

- `assets/images/start-screen.jpg`
- `assets/images/my-head.png`
- `assets/images/game-over.jpg`
- `assets/audio/start.mp3`
- `assets/audio/gameplay.mp3`
- `assets/audio/game-over.mp3`

## 5. Controls

- Space / Arrow Up: flap
- Mouse click / screen tap: flap
- Sound on/off: top-right button
- Restart: Play Again button after Game Over

## Troubleshooting

- If audio does not start, click Start Game again and check that browser audio is not muted. Browsers require a user gesture before audio playback.
- If the leaderboard is empty or shows a setup message, verify the Supabase URL/key, anonymous sign-ins, SQL schema and RLS policies.
- If images do not load, confirm that you opened the folder root with Live Server and did not move the `assets` directory.
