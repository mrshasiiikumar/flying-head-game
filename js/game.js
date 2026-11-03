import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const $ = (selector) => document.querySelector(selector);
const startScreen = $("#startScreen");
const gameOverScreen = $("#gameOverScreen");
const startAudio = $("#startAudio");
const gameplayAudio = $("#gameplayAudio");
const gameOverAudio = $("#gameOverAudio");

const WIDTH = canvas.width, HEIGHT = canvas.height;
const GROUND_Y = 586;
const PIPE_WIDTH = 50;
const PIPE_GAP = 200;
const PIPE_SPACING = 238;
const GRAVITY = 0.34;
const FLAP = -6.6;
const BASE_SPEED = 2.7;

let gameState = "menu";
let score = 0;
let bestScore = Number(localStorage.getItem("flyingHeadBest") || 0);
let pipes = [];
let particles = [];
let animationId = null;
let previousTime = 0;
let elapsed = 0;
let audioEnabled = true;
let startAudioFinished = false;
let supabase = null;
let currentPlayerId = null;
let currentUsername = "";
let playerSprite = new Image();
playerSprite.src = "./assets/images/my-head.png";
let spriteReady = false;
playerSprite.onload = () => { spriteReady = true; };
playerSprite.onerror = () => { console.warn("Could not load flying-head image."); };

const player = { x: 126, y: 285, velocity: 0, radius: 22, rotation: 0 };

function setAudioVolume() {
  [startAudio, gameplayAudio, gameOverAudio].forEach((audio) => audio.volume = 0.72);
}
function stopAllAudio() {
  [startAudio, gameplayAudio, gameOverAudio].forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}
function playAudio(audio, loop = false) {
  if (!audioEnabled) return Promise.resolve();
  audio.loop = loop;
  audio.currentTime = 0;
  return audio.play().catch((error) => {
    console.warn("Audio playback was blocked by the browser:", error);
  });
}
function updateSoundButton() {
  $("#soundToggle").textContent = audioEnabled ? "♫ Sound on" : "♫ Sound off";
  $("#soundToggle").setAttribute("aria-label", audioEnabled ? "Mute audio" : "Enable audio");
}
setAudioVolume();
window.addEventListener("load", () => {
  startAudio.loop = false;

  
});
updateSoundButton();

function connectSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY ||
      SUPABASE_URL.includes("YOUR_PROJECT") || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) {
    $("#databaseStatus").textContent = "Supabase not configured. Game works locally; follow README to enable online scores.";
    return;
  }
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    $("#databaseStatus").textContent = "Connecting to global leaderboard…";
    refreshLeaderboard();
  } catch (error) {
    console.error(error);
    $("#databaseStatus").textContent = "Could not initialize Supabase. Check js/supabase-config.js.";
  }
}

async function ensurePlayer(username) {
  if (!supabase) return null;
  let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  let user = sessionData.session?.user;
  if (!user) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
    user = result.data.user;
  }
  currentPlayerId = user.id;
  const { error } = await supabase.from("players").upsert({
    id: currentPlayerId,
    username,
    best_score: bestScore,
    games_played: 0
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  // Refresh the display name for returning anonymous players.
  const update = await supabase.from("players").update({ username }).eq("id", currentPlayerId);
  if (update.error) console.warn("Could not update player name:", update.error.message);
  return currentPlayerId;
}

async function refreshLeaderboard() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("players")
    .select("username,best_score")
    .order("best_score", { ascending: false })
    .order("username", { ascending: true })
    .limit(10);
  if (error) {
    $("#databaseStatus").textContent = "Leaderboard unavailable. Check Supabase SQL and anonymous sign-in settings.";
    console.error(error);
    return;
  }
  const list = $("#leaderboardList");
  list.replaceChildren();
  if (!data?.length) {
    list.innerHTML = '<li class="empty-state">No scores yet. Be the first to fly!</li>';
  } else {
    data.forEach((player, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = String(index + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = player.username || "Player";
      const points = document.createElement("strong");
      points.className = "player-score";
      points.textContent = player.best_score ?? 0;
      item.append(rank, name, points);
      list.append(item);
    });
  }
  $("#databaseStatus").textContent = "Top 10 players · Live from Supabase";
}

async function saveScore(finalScore) {
  const status = $("#saveStatus");
  if (!supabase || !currentPlayerId) {
    status.textContent = "Score saved on this device. Connect Supabase for global ranking.";
    return;
  }
  status.textContent = "Saving your score…";
  try {
    const { data: profile, error: readError } = await supabase
      .from("players").select("best_score,games_played").eq("id", currentPlayerId).single();
    if (readError) throw readError;
    const nextBest = Math.max(Number(profile.best_score || 0), finalScore);
    const { error: updateError } = await supabase.from("players").update({
      best_score: nextBest,
      games_played: Number(profile.games_played || 0) + 1,
      username: currentUsername
    }).eq("id", currentPlayerId);
    if (updateError) throw updateError;
    const { error: insertError } = await supabase.from("scores").insert({
      player_id: currentPlayerId,
      score: finalScore
    });
    if (insertError) throw insertError;
    status.textContent = "Score saved to the global leaderboard!";
    refreshLeaderboard();
  } catch (error) {
    console.error("Score save failed:", error);
    status.textContent = "Could not save online. Check Supabase setup and try again.";
  }
}

function resetGame() {
  score = 0;
  elapsed = 0;
  pipes = [];
  particles = [];
  player.y = 285;
  player.velocity = 0;
  player.rotation = 0;
  for (let i = 0; i < 3; i++) addPipe(390 + i * PIPE_SPACING);
  updateScore();
}
function updateScore() {
  $("#score").textContent = score;
  $("#best").textContent = bestScore;
  $("#sideBest").textContent = bestScore;
}
function addPipe(x) {
  const topHeight = 78 + Math.random() * 250;
  pipes.push({ x, topHeight, scored: false });
}
function flap() {
  if (gameState !== "playing") return;
  player.velocity = FLAP;
  player.rotation = -0.28;
  // Intentionally no flap sound: only the user's three supplied music clips are used.
}
function startGame() {
  startAudio.pause();
startAudio.currentTime = 0;
  const usernameInput = $("#username");
  const username = usernameInput ? usernameInput.value.trim() : (localStorage.getItem("flyingHeadUsername") || "Player");
  if (usernameInput && !username) {
    $("#startStatus").textContent = "Please enter a username before starting.";
    usernameInput.focus();
    return;
  }
  if (username.length > 18) return;
  currentUsername = username;
  localStorage.setItem("flyingHeadUsername", username);
  stopAllAudio();
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  gameState = "playing";
  resetGame();
  flap();
  previousTime = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);

  // Play the short start clip first; gameplay music begins after it finishes.
  startAudioFinished = false;
  if (audioEnabled) {
    playAudio(startAudio, false).then(() => {
      if (startAudio.paused && gameState === "playing") startGameplayMusic();
    });
    startAudio.onended = () => {
      startAudioFinished = true;
      if (gameState === "playing") startGameplayMusic();
    };
  } else {
    startGameplayMusic();
  }
  if (supabase) {
    ensurePlayer(username).catch((error) => {
      console.error(error);
      $("#startStatus").textContent = "Playing offline; online profile setup failed. Check Supabase settings.";
    });
  }
}
function startGameplayMusic() {
  if (gameState === "playing" && audioEnabled && gameplayAudio.paused) {
    playAudio(gameplayAudio, true);
  }
}
function endGame() {
  if (gameState !== "playing") return;
  gameState = "over";
  gameplayAudio.pause();
  gameplayAudio.currentTime = 0;
  startAudio.pause();
  startAudio.currentTime = 0;
  $("#finalScore").textContent = score;
  const isNewBest = score > bestScore;
  if (isNewBest) {
    bestScore = score;
    localStorage.setItem("flyingHeadBest", String(bestScore));
    $("#newBest").classList.remove("hidden");
  } else {
    $("#newBest").classList.add("hidden");
  }
  updateScore();
  gameOverScreen.classList.remove("hidden");
  playAudio(gameOverAudio, true);
  saveScore(score);
  draw();
}
function restartGame() {
  stopAllAudio();
  startGame();
}
function goHome() {
  stopAllAudio();
  cancelAnimationFrame(animationId);
  gameState = "menu";
  gameOverScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
  $("#startStatus").textContent = "Tap, click or press Space to flap.";
  draw();
}
function circleRectCollision(cx, cy, radius, x, y, width, height) {
  const nearestX = Math.max(x, Math.min(cx, x + width));
  const nearestY = Math.max(y, Math.min(cy, y + height));
  return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 < radius ** 2;
}
function update(dt) {
  elapsed += dt;
  player.velocity += GRAVITY * dt;
  player.y += player.velocity * dt;
  player.rotation = Math.min(0.9, Math.max(-0.45, player.velocity * 0.07));

  if (player.y + player.radius >= GROUND_Y || player.y - player.radius <= 0) {
    endGame(); return;
  }

  const speed = BASE_SPEED + Math.min(1.8, score * 0.055);
  for (const pipe of pipes) {
    pipe.x -= speed * dt;
    const lowerY = pipe.topHeight + PIPE_GAP;
    if (circleRectCollision(player.x, player.y, player.radius - 3, pipe.x, 0, PIPE_WIDTH, pipe.topHeight) ||
        circleRectCollision(player.x, player.y, player.radius - 3, pipe.x, lowerY, PIPE_WIDTH, GROUND_Y - lowerY)) {
      endGame(); return;
    }
    if (!pipe.scored && pipe.x + PIPE_WIDTH < player.x) {
      pipe.scored = true;
      score++;
      updateScore();
    }
  }
  if (pipes[pipes.length - 1].x < WIDTH - PIPE_SPACING) addPipe(WIDTH + 20);
  pipes = pipes.filter(pipe => pipe.x + PIPE_WIDTH > -10);
  particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
  particles = particles.filter(p => p.life > 0);
}
function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#78d5f0");
  gradient.addColorStop(1, "#e0f7e8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#ffffffa8";
  for (let i = 0; i < 4; i++) {
    const x = ((i * 155 - elapsed * 0.45) % (WIDTH + 100) + WIDTH + 100) % (WIDTH + 100) - 45;
    const y = 95 + (i % 3) * 78;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.arc(x + 22, y - 9, 24, 0, Math.PI * 2);
    ctx.arc(x + 47, y, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#a4dfbd";
  ctx.beginPath(); ctx.moveTo(0, 475);
  for (let x = 0; x <= WIDTH; x += 80) ctx.quadraticCurveTo(x + 40, 425 + Math.sin(x * .02) * 18, x + 80, 475);
  ctx.lineTo(WIDTH, GROUND_Y); ctx.lineTo(0, GROUND_Y); ctx.fill();
}
function roundedRect(x, y, w, h, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}
function drawPipes() {
  for (const pipe of pipes) {
    const lowerY = pipe.topHeight + PIPE_GAP;
    roundedRect(pipe.x, -12, PIPE_WIDTH, pipe.topHeight + 12, 8, "#238b58");
    roundedRect(pipe.x - 6, pipe.topHeight - 22, PIPE_WIDTH + 12, 22, 6, "#35b96e");
    roundedRect(pipe.x, lowerY, PIPE_WIDTH, GROUND_Y - lowerY, 8, "#238b58");
    roundedRect(pipe.x - 6, lowerY, PIPE_WIDTH + 12, 22, 6, "#35b96e");
    ctx.fillStyle = "#ffffff30";
    ctx.fillRect(pipe.x + 12, 0, 8, Math.max(0, pipe.topHeight - 24));
    ctx.fillRect(pipe.x + 12, lowerY + 26, 8, Math.max(0, GROUND_Y - lowerY - 26));
  }
}
function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.rotation);
  if (spriteReady) {
    const ratio = playerSprite.width / playerSprite.height;
    const h = 66;
    const w = h * ratio;
    ctx.drawImage(playerSprite, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = "#eaa17e";
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawGround() {
  ctx.fillStyle = "#70bd59"; ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
  ctx.fillStyle = "#d9b56d"; ctx.fillRect(0, GROUND_Y + 12, WIDTH, HEIGHT - GROUND_Y - 12);
  ctx.fillStyle = "#8bd36b";
  for (let x = -(elapsed * 2 % 32); x < WIDTH; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 15, GROUND_Y + 12); ctx.lineTo(x + 32, GROUND_Y); ctx.fill();
  }
}
function draw() {
  drawBackground();
  drawPipes();
  drawGround();
  drawPlayer();
}
function gameLoop(now) {
  if (gameState !== "playing") return;
  const dt = Math.min((now - previousTime) / 16.667, 2);
  previousTime = now;
  update(dt);
  draw();
  if (gameState === "playing") animationId = requestAnimationFrame(gameLoop);
}
function toggleLeaderboard() {
  document.querySelector(".side-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

$("#startButton").addEventListener("click", startGame);
$("#restartButton").addEventListener("click", restartGame);
$("#homeButton").addEventListener("click", goHome);
$("#leaderboardToggle").addEventListener("click", toggleLeaderboard);
$("#soundToggle").addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  if (!audioEnabled) stopAllAudio();
  else if (gameState === "playing") startGameplayMusic();
  else if (gameState === "over") playAudio(gameOverAudio, true);
  updateSoundButton();
});
canvas.addEventListener("pointerdown", (event) => {
  if (gameState === "playing") { event.preventDefault(); flap(); }
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    if (gameState === "playing") { event.preventDefault(); flap(); }
  }
});
const usernameInput = $("#username");
if (usernameInput) {
  usernameInput.value = localStorage.getItem("flyingHeadUsername") || "";
}
bestScore = Number(localStorage.getItem("flyingHeadBest") || 0);
updateScore();
connectSupabase();
draw();
