const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const keys = new Set();
const world = {
  width: canvas.width,
  height: canvas.height,
  room: { x: 80, y: 62, w: 800, h: 500 },
};

const player = {
  x: world.width / 2,
  y: world.height / 2 + 80,
  radius: 15,
  speed: 185,
  facing: 1,
  stride: 0,
  attackTime: 0,
  attackDuration: 0.34,
  attackCooldown: 0,
};

const blockers = [
  { x: 130, y: 112, w: 108, h: 56, label: "table" },
  { x: 708, y: 122, w: 92, h: 118, label: "crate" },
  { x: 198, y: 434, w: 128, h: 42, label: "bench" },
  { x: 480, y: 112, w: 78, h: 78, label: "pillar" },
  { x: 628, y: 416, w: 92, h: 74, label: "barrels" },
];

let lastTime = performance.now();

window.addEventListener("keydown", (event) => {
  if (["w", "a", "s", "d", " "].includes(event.key.toLowerCase())) {
    event.preventDefault();
  }

  if (event.key === " " && !event.repeat) {
    startAttack();
  }

  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

function gameLoop(now) {
  const delta = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(delta);
  draw(now / 1000);
  requestAnimationFrame(gameLoop);
}

function update(delta) {
  player.attackCooldown = Math.max(0, player.attackCooldown - delta);
  player.attackTime = Math.max(0, player.attackTime - delta);

  const horizontal = axis("a", "d");
  const vertical = axis("w", "s");
  const length = Math.hypot(horizontal, vertical) || 1;
  const attackMoveFactor = player.attackTime > 0 ? 0.42 : 1;
  const dx = (horizontal / length) * player.speed * attackMoveFactor * delta;
  const dy = (vertical / length) * player.speed * attackMoveFactor * delta;

  if (horizontal !== 0) {
    player.facing = Math.sign(horizontal);
  }

  movePlayer(dx, 0);
  movePlayer(0, dy);

  if (horizontal !== 0 || vertical !== 0) {
    player.stride += delta * 10;
  } else {
    player.stride *= 0.82;
  }
}

function startAttack() {
  if (player.attackCooldown > 0) {
    return;
  }

  player.attackTime = player.attackDuration;
  player.attackCooldown = 0.48;
}

function axis(negativeKey, positiveKey) {
  return Number(keys.has(positiveKey)) - Number(keys.has(negativeKey));
}

function movePlayer(dx, dy) {
  player.x += dx;
  player.y += dy;

  const r = player.radius;
  const room = world.room;
  player.x = clamp(player.x, room.x + r, room.x + room.w - r);
  player.y = clamp(player.y, room.y + r, room.y + room.h - r);

  for (const box of blockers) {
    resolveCircleRect(player, box);
  }
}

function resolveCircleRect(circle, rect) {
  const nearestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const nearestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const diffX = circle.x - nearestX;
  const diffY = circle.y - nearestY;
  const distance = Math.hypot(diffX, diffY);

  if (distance === 0 || distance >= circle.radius) {
    return;
  }

  const push = circle.radius - distance;
  circle.x += (diffX / distance) * push;
  circle.y += (diffY / distance) * push;
}

function draw(time) {
  ctx.clearRect(0, 0, world.width, world.height);
  drawBackdrop();
  drawFloor();
  drawRoomWalls();
  drawProps();
  drawPlayer(time);
  drawLighting(time);
}

function drawBackdrop() {
  const gradient = ctx.createRadialGradient(480, 320, 40, 480, 320, 560);
  gradient.addColorStop(0, "#3b261a");
  gradient.addColorStop(1, "#090706");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, world.width, world.height);
}

function drawFloor() {
  const room = world.room;
  ctx.fillStyle = "#21170f";
  ctx.fillRect(room.x, room.y, room.w, room.h);

  for (let y = room.y; y < room.y + room.h; y += 42) {
    for (let x = room.x; x < room.x + room.w; x += 64) {
      const offset = ((y / 42) % 2) * 32;
      ctx.fillStyle = ((x + y) / 2) % 3 === 0 ? "#261b12" : "#1d140d";
      ctx.fillRect(x + offset, y, 63, 41);
      ctx.strokeStyle = "rgba(8, 6, 4, 0.45)";
      ctx.strokeRect(x + offset, y, 64, 42);
    }
  }

  ctx.fillStyle = "rgba(67, 24, 15, 0.42)";
  ctx.beginPath();
  ctx.ellipse(356, 322, 88, 32, -0.18, 0, Math.PI * 2);
  ctx.ellipse(602, 262, 46, 16, 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoomWalls() {
  const room = world.room;
  ctx.lineWidth = 22;
  ctx.strokeStyle = "#120d0a";
  ctx.strokeRect(room.x - 8, room.y - 8, room.w + 16, room.h + 16);
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#56361f";
  ctx.strokeRect(room.x, room.y, room.w, room.h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#8a5630";
  ctx.strokeRect(room.x + 7, room.y + 7, room.w - 14, room.h - 14);

  ctx.fillStyle = "#100c09";
  ctx.fillRect(425, room.y - 8, 110, 24);
  ctx.fillStyle = "#6c4325";
  ctx.fillRect(438, room.y - 4, 84, 18);
}

function drawProps() {
  for (const box of blockers) {
    drawShadow(box.x + box.w / 2, box.y + box.h - 2, box.w * 0.7, box.h * 0.22);

    if (box.label === "pillar") {
      drawPillar(box);
    } else if (box.label === "barrels") {
      drawBarrels(box);
    } else {
      drawCrateLike(box);
    }
  }
}

function drawCrateLike(box) {
  ctx.fillStyle = box.label === "table" || box.label === "bench" ? "#5d3420" : "#4a2e1f";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = "#1b100b";
  ctx.lineWidth = 5;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = "rgba(232, 157, 88, 0.23)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(box.x + 10, box.y + 10);
  ctx.lineTo(box.x + box.w - 10, box.y + 10);
  ctx.stroke();
}

function drawPillar(box) {
  ctx.fillStyle = "#3f3429";
  ctx.beginPath();
  ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#16110d";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = "#6c5b48";
  ctx.beginPath();
  ctx.ellipse(box.x + box.w / 2 - 12, box.y + box.h / 2 - 15, 15, 10, -0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawBarrels(box) {
  for (let i = 0; i < 3; i += 1) {
    const cx = box.x + 24 + i * 24;
    const cy = box.y + 35 + (i % 2) * 10;
    ctx.fillStyle = "#5a311d";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 18, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1c100b";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#9b6537";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy - 8);
    ctx.lineTo(cx + 13, cy - 8);
    ctx.moveTo(cx - 13, cy + 8);
    ctx.lineTo(cx + 13, cy + 8);
    ctx.stroke();
  }
}

function drawPlayer(time) {
  const bob = Math.sin(player.stride) * 2.5;
  const x = player.x;
  const y = player.y + bob;
  const attackProgress = getAttackProgress();

  drawShadow(x, y + 18, 34, 10);
  drawAttackArc(x, y, attackProgress);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(player.facing, 1);
  ctx.rotate(attackProgress > 0 ? -0.08 + Math.sin(attackProgress * Math.PI) * 0.16 : 0);

  ctx.fillStyle = "#1a1110";
  ctx.fillRect(-5, -25, 10, 28);

  ctx.fillStyle = "#5e1f1b";
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(17, -5);
  ctx.lineTo(10, 18);
  ctx.lineTo(-10, 18);
  ctx.lineTo(-17, -5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#b9976d";
  ctx.beginPath();
  ctx.arc(0, -35, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#251812";
  ctx.beginPath();
  ctx.arc(-2, -40, 11, Math.PI * 0.88, Math.PI * 2.12);
  ctx.fill();

  drawSwordArm(time, attackProgress);

  ctx.strokeStyle = "#261511";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-8, 16);
  ctx.lineTo(-10, 30);
  ctx.moveTo(8, 16);
  ctx.lineTo(10, 30);
  ctx.stroke();

  ctx.restore();
}

function getAttackProgress() {
  if (player.attackTime <= 0) {
    return 0;
  }

  return 1 - player.attackTime / player.attackDuration;
}

function drawSwordArm(time, attackProgress) {
  const idleTipY = -25 + Math.sin(time * 5) * 2;

  if (attackProgress === 0) {
    ctx.strokeStyle = "#c6b183";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(12, -13);
    ctx.lineTo(28, idleTipY);
    ctx.stroke();
    return;
  }

  const eased = easeOutCubic(attackProgress);
  const angle = lerp(-1.08, 1.15, eased);
  const gripX = 12;
  const gripY = -13;
  const swordLength = 45;
  const tipX = gripX + Math.cos(angle) * swordLength;
  const tipY = gripY + Math.sin(angle) * swordLength;

  ctx.strokeStyle = "#6e3a20";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-10, -11);
  ctx.lineTo(gripX, gripY);
  ctx.stroke();

  ctx.strokeStyle = "#eadbb8";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(gripX, gripY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.strokeStyle = "#fff5d0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gripX + 4, gripY - 1);
  ctx.lineTo(tipX - 3, tipY);
  ctx.stroke();
}

function drawAttackArc(x, y, attackProgress) {
  if (attackProgress <= 0.15 || attackProgress >= 0.78) {
    return;
  }

  const visible = Math.sin(((attackProgress - 0.15) / 0.63) * Math.PI);
  const start = player.facing > 0 ? -0.9 : Math.PI + 0.9;
  const end = player.facing > 0 ? 0.78 : Math.PI - 0.78;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(255, 229, 157, ${0.46 * visible})`;
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y - 14, 55, start, end, player.facing < 0);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 117, 48, ${0.32 * visible})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y - 14, 64, start + 0.08 * player.facing, end - 0.08 * player.facing, player.facing < 0);
  ctx.stroke();
  ctx.restore();
}

function drawShadow(x, y, width, height) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLighting(time) {
  const pulse = 0.05 + Math.sin(time * 4) * 0.02;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const dark = ctx.createRadialGradient(player.x, player.y, 58, player.x, player.y, 430);
  dark.addColorStop(0, "rgba(255, 245, 212, 0.18)");
  dark.addColorStop(0.38, "rgba(98, 57, 32, 0.45)");
  dark.addColorStop(1, "rgba(0, 0, 0, 0.92)");
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const torch = ctx.createRadialGradient(160, 96, 8, 160, 96, 142 + pulse * 120);
  torch.addColorStop(0, "rgba(255, 174, 82, 0.72)");
  torch.addColorStop(1, "rgba(255, 95, 25, 0)");
  ctx.fillStyle = torch;
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.restore();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

requestAnimationFrame(gameLoop);
