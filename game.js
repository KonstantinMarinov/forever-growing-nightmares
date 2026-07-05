const ctx = canvas.getContext("2d");
const keys = new Set();
const players = [
  {
    x: world.width / 2 - 48,
    y: world.height / 2 + 80,
    radius: 15,
    speed: 185,
    facing: 1,
    stride: 0,
    attackTime: 0,
    attackDuration: 0.34,
    attackCooldown: 0,
    controls: { left: "a", right: "d", up: "w", down: "s", attack: " " },
    style: {
      tunic: "#5e1f1b",
      hair: "#251812",
      skin: "#b9976d",
      blade: "#eadbb8",
      slash: "255, 229, 157",
      feminine: false,
    },
  },
  {
    x: world.width / 2 + 48,
    y: world.height / 2 + 80,
    radius: 14,
    speed: 190,
    facing: -1,
    stride: 0,
    attackTime: 0,
    attackDuration: 0.32,
    attackCooldown: 0,
    controls: { left: "arrowleft", right: "arrowright", up: "arrowup", down: "arrowdown", attack: "enter" },
    style: {
      tunic: "#274d63",
      hair: "#3a1d13",
      skin: "#c79f78",
      blade: "#d9f2ff",
      slash: "151, 226, 255",
      feminine: true,
    },
  },
];

const blockers = [
  { x: 130, y: 112, w: 108, h: 56, label: "table" },
  { x: 708, y: 122, w: 92, h: 118, label: "crate" },
  { x: 198, y: 434, w: 128, h: 42, label: "bench" },
  { x: 480, y: 112, w: 78, h: 78, label: "pillar" },
  { x: 628, y: 416, w: 92, h: 74, label: "barrels" },
];

const enemies = [
  {
    type: "snake",
    x: 480,
    y: 252,
    radius: 13,
    speed: 92,
    facing: 0,
    slither: 0,
    hitTime: 0,
    hp: 4,
    alive: true,
  },
];

let lastTime = performance.now();

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "enter"].includes(key)) {
    event.preventDefault();
  }

  if (!event.repeat) {
    for (const player of players) {
      if (key === player.controls.attack) {
        startAttack(player);
      }
    }
  }

  keys.add(key);
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
  for (const player of players) {
    updatePlayer(player, delta);
  }

  for (const enemy of enemies) {
    updateEnemy(enemy, delta);
  }

  resolvePlayerCollision(players[0], players[1]);

  for (const enemy of enemies) {
    if (!enemy.alive) {
      continue;
    }

    for (const player of players) {
      resolveCircleCollision(player, enemy);
      constrainPlayerToRoom(player);
      constrainEnemyToRoom(enemy);
    }
  }
}

function updatePlayer(player, delta) {
  player.attackCooldown = Math.max(0, player.attackCooldown - delta);
  player.attackTime = Math.max(0, player.attackTime - delta);

  const horizontal = axis(player.controls.left, player.controls.right);
  const vertical = axis(player.controls.up, player.controls.down);
  const length = Math.hypot(horizontal, vertical) || 1;
  const attackMoveFactor = player.attackTime > 0 ? 0.42 : 1;
  const dx = (horizontal / length) * player.speed * attackMoveFactor * delta;
  const dy = (vertical / length) * player.speed * attackMoveFactor * delta;

  if (horizontal !== 0) {
    player.facing = Math.sign(horizontal);
  }

  movePlayer(player, dx, 0);
  movePlayer(player, 0, dy);

  if (horizontal !== 0 || vertical !== 0) {
    player.stride += delta * 10;
  } else {
    player.stride *= 0.82;
  }
}

function startAttack(player) {
  if (player.attackCooldown > 0) {
    return;
  }

  player.attackTime = player.attackDuration;
  player.attackCooldown = 0.48;
  strikeEnemies(player);
}

function axis(negativeKey, positiveKey) {
  return Number(keys.has(positiveKey)) - Number(keys.has(negativeKey));
}

function movePlayer(player, dx, dy) {
  player.x += dx;
  player.y += dy;

  constrainPlayerToRoom(player);

  for (const box of blockers) {
    resolveCircleRect(player, box);
  }
}

function updateEnemy(enemy, delta) {
  enemy.hitTime = Math.max(0, enemy.hitTime - delta);

  if (!enemy.alive) {
    return;
  }

  enemy.slither += delta * 9;

  const target = getNearestPlayer(enemy);
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const wave = Math.sin(enemy.slither) * 0.45;
  const forwardX = dx / distance;
  const forwardY = dy / distance;
  const sideX = -forwardY;
  const sideY = forwardX;
  const moveX = (forwardX + sideX * wave) * enemy.speed * delta;
  const moveY = (forwardY + sideY * wave) * enemy.speed * delta;

  enemy.facing = Math.atan2(forwardY, forwardX);
  moveEnemy(enemy, moveX, 0);
  moveEnemy(enemy, 0, moveY);
}

function moveEnemy(enemy, dx, dy) {
  enemy.x += dx;
  enemy.y += dy;
  constrainEnemyToRoom(enemy);

  for (const box of blockers) {
    resolveCircleRect(enemy, box);
  }
}

function getNearestPlayer(enemy) {
  return players.reduce((nearest, player) => {
    const nearestDistance = distanceBetween(enemy, nearest);
    const playerDistance = distanceBetween(enemy, player);
    return playerDistance < nearestDistance ? player : nearest;
  }, players[0]);
}

function strikeEnemies(player) {
  for (const enemy of enemies) {
    if (!enemy.alive || !isEnemyInAttackArc(player, enemy)) {
      continue;
    }

    enemy.hp -= 1;
    enemy.hitTime = 0.22;
    if (enemy.hp <= 0) {
      enemy.alive = false;
    }
  }
}

function isEnemyInAttackArc(player, enemy) {
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const distance = Math.hypot(dx, dy);

  if (distance > 72) {
    return false;
  }

  const forwardHit = Math.sign(dx || player.facing) === player.facing;
  return forwardHit || distance < 32;
}

function resolvePlayerCollision(first, second) {
  resolveCircleCollision(first, second);
  constrainPlayerToRoom(first);
  constrainPlayerToRoom(second);
}

function resolveCircleCollision(first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const distance = Math.hypot(dx, dy);
  const minDistance = first.radius + second.radius;

  if (distance === 0 || distance >= minDistance) {
    return;
  }

  const push = (minDistance - distance) / 2;
  const nx = dx / distance;
  const ny = dy / distance;
  first.x -= nx * push;
  first.y -= ny * push;
  second.x += nx * push;
  second.y += ny * push;
}

function constrainPlayerToRoom(player) {
  const r = player.radius;
  const room = world.room;
  player.x = clamp(player.x, room.x + r, room.x + room.w - r);
  player.y = clamp(player.y, room.y + r, room.y + room.h - r);
}

function constrainEnemyToRoom(enemy) {
  const r = enemy.radius;
  const room = world.room;
  enemy.x = clamp(enemy.x, room.x + r, room.x + room.w - r);
  enemy.y = clamp(enemy.y, room.y + r, room.y + room.h - r);
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
  const actors = [
    ...players.map((player) => ({ kind: "player", actor: player })),
    ...enemies.map((enemy) => ({ kind: "enemy", actor: enemy })),
  ];

  for (const { kind, actor } of actors.sort((a, b) => a.actor.y - b.actor.y)) {
    if (kind === "player") {
      drawPlayer(actor, time);
    } else {
      drawEnemy(actor, time);
    }
  }
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

function drawEnemy(enemy, time) {
  if (enemy.type === "snake") {
    drawSnake(enemy, time);
  }
}

function drawSnake(snake, time) {
  const isDead = !snake.alive;
  const flash = snake.hitTime > 0 && Math.floor(time * 28) % 2 === 0;
  const segmentCount = isDead ? 8 : 11;
  const angle = snake.facing;
  const forwardX = Math.cos(angle);
  const forwardY = Math.sin(angle);
  const sideX = -forwardY;
  const sideY = forwardX;

  drawShadow(snake.x - forwardX * 22, snake.y + 8, 42, 8);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = segmentCount - 1; i >= 0; i -= 1) {
    const curl = isDead ? i * 0.55 : Math.sin(snake.slither - i * 0.72) * 7;
    const distance = i * 8;
    const x = snake.x - forwardX * distance + sideX * curl;
    const y = snake.y - forwardY * distance + sideY * curl;
    const size = Math.max(6, 13 - i * 0.55);

    ctx.fillStyle = flash ? "#f5dfb4" : i % 2 === 0 ? "#315b22" : "#203d18";
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.62, angle, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#10150b";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const headX = snake.x + forwardX * 7;
  const headY = snake.y + forwardY * 7;
  ctx.fillStyle = flash ? "#fff0c8" : "#426c2a";
  ctx.beginPath();
  ctx.ellipse(headX, headY, 15, 10, angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#10150b";
  ctx.lineWidth = 3;
  ctx.stroke();

  if (!isDead) {
    drawSnakeFace(headX, headY, angle, sideX, sideY, forwardX, forwardY);
  }

  ctx.restore();
}

function drawSnakeFace(x, y, angle, sideX, sideY, forwardX, forwardY) {
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#f2d56b";
    ctx.beginPath();
    ctx.arc(x + forwardX * 5 + sideX * side * 4, y + forwardY * 5 + sideY * side * 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#b92020";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + forwardX * 13, y + forwardY * 13);
  ctx.lineTo(x + forwardX * 21, y + forwardY * 21);
  ctx.moveTo(x + forwardX * 21, y + forwardY * 21);
  ctx.lineTo(x + forwardX * 25 + Math.cos(angle - 0.7) * 5, y + forwardY * 25 + Math.sin(angle - 0.7) * 5);
  ctx.moveTo(x + forwardX * 21, y + forwardY * 21);
  ctx.lineTo(x + forwardX * 25 + Math.cos(angle + 0.7) * 5, y + forwardY * 25 + Math.sin(angle + 0.7) * 5);
  ctx.stroke();
}

function drawPlayer(player, time) {
  const bob = Math.sin(player.stride) * 2.5;
  const x = player.x;
  const y = player.y + bob;
  const attackProgress = getAttackProgress(player);
  const style = player.style;

  drawShadow(x, y + 18, 34, 10);
  drawAttackArc(player, x, y, attackProgress);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(player.facing, 1);
  ctx.rotate(attackProgress > 0 ? -0.08 + Math.sin(attackProgress * Math.PI) * 0.16 : 0);

  ctx.fillStyle = "#1a1110";
  ctx.fillRect(-5, -25, 10, 28);

  ctx.fillStyle = style.tunic;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(style.feminine ? 14 : 17, -5);
  ctx.lineTo(style.feminine ? 8 : 10, 18);
  ctx.lineTo(style.feminine ? -8 : -10, 18);
  ctx.lineTo(style.feminine ? -14 : -17, -5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = style.skin;
  ctx.beginPath();
  ctx.arc(0, -35, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = style.hair;
  ctx.beginPath();
  ctx.arc(-2, -40, 11, Math.PI * 0.88, Math.PI * 2.12);
  ctx.fill();

  if (style.feminine) {
    ctx.beginPath();
    ctx.ellipse(-9, -28, 7, 17, -0.28, 0, Math.PI * 2);
    ctx.ellipse(8, -29, 6, 15, 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSwordArm(style, time, attackProgress);

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

function getAttackProgress(player) {
  if (player.attackTime <= 0) {
    return 0;
  }

  return 1 - player.attackTime / player.attackDuration;
}

function drawSwordArm(style, time, attackProgress) {
  const idleTipY = -25 + Math.sin(time * 5) * 2;

  if (attackProgress === 0) {
    ctx.strokeStyle = style.blade;
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

  ctx.strokeStyle = style.blade;
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

function drawAttackArc(player, x, y, attackProgress) {
  if (attackProgress <= 0.15 || attackProgress >= 0.78) {
    return;
  }

  const visible = Math.sin(((attackProgress - 0.15) / 0.63) * Math.PI);
  const start = player.facing > 0 ? -0.9 : Math.PI + 0.9;
  const end = player.facing > 0 ? 0.78 : Math.PI - 0.78;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(${player.style.slash}, ${0.46 * visible})`;
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y - 14, 55, start, end, player.facing < 0);
  ctx.stroke();

  ctx.strokeStyle = `rgba(${player.style.slash}, ${0.32 * visible})`;
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
  const lightX = (players[0].x + players[1].x) / 2;
  const lightY = (players[0].y + players[1].y) / 2;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const dark = ctx.createRadialGradient(lightX, lightY, 58, lightX, lightY, 430);
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

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

requestAnimationFrame(gameLoop);
