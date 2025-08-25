// Echo Shadows – HTML5/Canvas
// Fixed: correct collision; proper clamping for clones; saves highscore on death.

const VWIDTH = 1280, VHEIGHT = 720;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Offscreen virtual canvas for crisp scaling
const off = document.createElement("canvas");
off.width = VWIDTH; off.height = VHEIGHT;
const g = off.getContext("2d");

// ---- Constants ----
const PLAYER_SIZE = 28;
const START_SPEED = 5;
const CLONE_INTERVAL = 5000;      // ms between clones
const LEVEL_EVERY = 5;            // speed up every N clones survived
const TRAIL_MAX = 15;

// ---- Assets ----
const assets = {};
function loadImage(key, src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { assets[key] = img; res(); };
    img.onerror = () => res();
    img.src = src;
  });
}

// ---- HUD (optional if elements exist) ----
const scoreEl = document.getElementById("score");
const bestEl  = document.getElementById("best");
const levelEl = document.getElementById("level");

// ---- Game state ----
let player = { x: VWIDTH/2 - PLAYER_SIZE/2, y: VHEIGHT/2 - PLAYER_SIZE/2, w: PLAYER_SIZE, h: PLAYER_SIZE };
let playerSpeed = START_SPEED;
let cloneSpeed = 1.0;

let score = 0, level = 0;
let currentPath = [];                   // per-frame [dx,dy] since last spawn
let startPos = { x: player.x, y: player.y };
let clones = [];                        // { path, pos:{x,y}, idx, w, h }
let lastSpawn = performance.now();

let particles = [];
let trail = [];
let paused = false, gameOver = false;

let highscore = parseInt(localStorage.getItem("echo_highscore") || "0", 10);
updateHUD();

// ---- Input ----
const keys = {};
window.addEventListener("keydown", e => {
  if (e.key === "p" || e.key === "P") { if (!gameOver) paused = !paused; }
  if (e.key === "Enter" && gameOver) { resetGame(); }
  keys[e.key] = true;
});
window.addEventListener("keyup", e => { keys[e.key] = false; });

// ---- Touch Drag Controls ----
// --- Add this inside your game.js ---

// Touch Controls (Mobile)
let isTouching = false;

canvas.addEventListener("touchstart", function (e) {
  e.preventDefault();
  isTouching = true;
  const touch = e.touches[0];
  player.x = touch.clientX - player.width / 2;
  player.y = touch.clientY - player.height / 2;
});

canvas.addEventListener("touchmove", function (e) {
  if (!isTouching) return;
  e.preventDefault();
  const touch = e.touches[0];
  player.x = touch.clientX - player.width / 2;
  player.y = touch.clientY - player.height / 2;
});

canvas.addEventListener("touchend", function (e) {
  e.preventDefault();
  isTouching = false;
});


// Touch D-pad (optional)
const touch = { up:false, down:false, left:false, right:false };
document.querySelectorAll("#touch-controls button").forEach(btn => {
  const dir = btn.dataset.dir;
  const on  = (e) => { e && e.preventDefault(); touch[dir] = true; };
  const off = (e) => { e && e.preventDefault(); touch[dir] = false; };
  btn.addEventListener("touchstart", on, { passive:false });
  btn.addEventListener("touchend",   off, { passive:false });
  btn.addEventListener("mousedown",  on);
  btn.addEventListener("mouseup",    off);
  btn.addEventListener("mouseleave", off);
});

// ---- Utils ----
function clampRect(obj, w, h) {
  if (obj.x < 0) obj.x = 0;
  if (obj.y < 0) obj.y = 0;
  if (obj.x + w > VWIDTH)  obj.x = VWIDTH  - w;
  if (obj.y + h > VHEIGHT) obj.y = VHEIGHT - h;
}

// ✅ Correct AABB collision check
function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ---- Particles ----
function addParticles(x, y, color, count = 30) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: Math.random()*8 - 4,
      vy: Math.random()*8 - 4,
      life: Math.floor(Math.random()*20) + 20,
      color,
      size: Math.random()*4 + 2
    });
  }
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  for (const p of particles) {
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    g.fill();
  }
}

// ---- Clones ----
function spawnClone() {
  if (currentPath.length === 0) return; // no movement, no clone
  clones.push({
    path: currentPath.slice(),
    pos: { x: startPos.x, y: startPos.y },
    idx: 0,
    w: PLAYER_SIZE, h: PLAYER_SIZE
  });

  score += 1;
  if (score % LEVEL_EVERY === 0) {
    level += 1;
    playerSpeed += 1;
    cloneSpeed  += 0.25;
    addParticles(player.x + player.w/2, player.y + player.h/2, "#76ffb9", 40);
  }
  updateHUD();

  currentPath.length = 0;
  startPos = { x: player.x, y: player.y };
  lastSpawn = performance.now();
}

function updateClones() {
  for (const c of clones) {
    if (c.idx < c.path.length) {
      const [dx, dy] = c.path[c.idx];
      c.pos.x += Math.trunc(dx * cloneSpeed);
      c.pos.y += Math.trunc(dy * cloneSpeed);
      c.idx++;
      clampRect(c.pos, c.w, c.h); // ✅ proper clamping for clones
    }
  }
}
function drawClones() {
  for (const c of clones) {
    if (assets.shadow) g.drawImage(assets.shadow, c.pos.x, c.pos.y, c.w, c.h);
    else { g.fillStyle = "#8a2be2"; g.fillRect(c.pos.x, c.pos.y, c.w, c.h); }
  }
}

// ---- Main update/draw ----
function update() {
  if (paused || gameOver) return;

  let dx = 0, dy = 0;
    if (!dragging) {
    if (keys["ArrowUp"] || keys["w"] || touch.up)    dy -= playerSpeed;
    if (keys["ArrowDown"] || keys["s"] || touch.down) dy += playerSpeed;
    if (keys["ArrowLeft"] || keys["a"] || touch.left) dx -= playerSpeed;
    if (keys["ArrowRight"] || keys["d"] || touch.right) dx += playerSpeed;

    player.x += dx; player.y += dy;
    clampRect(player, player.w, player.h);

    if (dx !== 0 || dy !== 0) currentPath.push([dx, dy]);
    } else {
    // dragging counts as movement
    currentPath.push([0, 0]);
    }

  // trail
  trail.push({ x: player.x, y: player.y });
  if (trail.length > TRAIL_MAX) trail.shift();

  // spawn clones on interval (only if you moved)
  if (performance.now() - lastSpawn >= CLONE_INTERVAL && currentPath.length) {
    spawnClone();
  }

  updateClones();

  // collisions
  for (const c of clones) {
    const box = { x: c.pos.x, y: c.pos.y, w: c.w, h: c.h };
    if (rectsIntersect(player, box)) {
      gameOver = true;
      addParticles(player.x + player.w/2, player.y + player.h/2, "red", 60);
      if (score > highscore) {
        highscore = score;
        localStorage.setItem("echo_highscore", String(highscore));
        updateHUD();
      }
      break;
    }
  }

  updateParticles();
}

function draw() {
  g.clearRect(0, 0, VWIDTH, VHEIGHT);

  // background
  if (assets.bg) g.drawImage(assets.bg, 0, 0, VWIDTH, VHEIGHT);
  else { g.fillStyle = "#000"; g.fillRect(0, 0, VWIDTH, VHEIGHT); }

  // trail
  g.fillStyle = "rgba(118,255,185,0.35)";
  for (const t of trail) g.arc(t.x, t.y, PLAYER_SIZE, PLAYER_SIZE, 2 * Math.PI);

  // player
  if (assets.player) g.drawImage(assets.player, player.x, player.y, player.w, player.h);
  else { g.fillStyle = "#76ffb9"; g.fillRect(player.x, player.y, player.w, player.h); }

  drawClones();
  drawParticles();

  // overlay texts
  g.fillStyle = "#fff";
  g.font = "20px Arial";
  g.fillText(`Score: ${score}`, 10, 24);
  g.fillText(`Best: ${highscore}`, 10, 48);
  g.fillText(`Level: ${level}`, 10, 72);

  if (paused) {
    g.fillStyle = "yellow";
    g.fillText("Paused", VWIDTH/2 - 30, VHEIGHT/2);
  }
  if (gameOver) {
    g.fillStyle = "red";
    g.fillText("Game Over - Press Enter to Restart", VWIDTH/2 - 160, VHEIGHT/2);
  }

  // blit to screen with letterbox scale
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / VWIDTH, canvas.height / VHEIGHT);
  const dw = Math.floor(VWIDTH * scale), dh = Math.floor(VHEIGHT * scale);
  const dx = Math.floor((canvas.width - dw) / 2), dy = Math.floor((canvas.height - dh) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, VWIDTH, VHEIGHT, dx, dy, dw, dh);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ---- HUD helper ----
function updateHUD() {
  if (scoreEl) scoreEl.textContent = `Score: ${score}`;
  if (bestEl)  bestEl.textContent  = `Best: ${highscore}`;
  if (levelEl) levelEl.textContent = `Lvl: ${level}`;
}

// ---- Reset ----
function resetGame() {
  score = 0; level = 0;
  playerSpeed = START_SPEED; cloneSpeed = 1.0;

  player = { x: VWIDTH/2 - PLAYER_SIZE/2, y: VHEIGHT/2 - PLAYER_SIZE/2, w: PLAYER_SIZE, h: PLAYER_SIZE };
  startPos = { x: player.x, y: player.y };
  currentPath = [];
  clones = [];
  trail = [];
  particles = [];
  lastSpawn = performance.now();
  paused = false; gameOver = false;
  updateHUD();
}

// ---- Resize ----
function resize() {
  const topbar = document.getElementById("topbar");
  const topH = topbar ? topbar.offsetHeight : 0;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - topH;
}
window.addEventListener("resize", resize);
resize();

// ---- Boot ----
Promise.all([
  loadImage("bg", "assets/bg3.png"),
  loadImage("player", "assets/player.png"),
  loadImage("shadow", "assets/shadow.png")
]).then(() => {
  loop();
});

// ---- PWA Install Prompt ----
let deferredPrompt;
const installPopup = document.getElementById("installPopup");
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installPopup.style.display = "block"; // show popup
});

installBtn.addEventListener("click", async () => {
  installPopup.style.display = "none";
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
});


