(function () {
  // The overlay markup now lives directly in index.html instead of being
  // injected by a content script, so we just grab a reference to it.
  const overlay = document.getElementById('tank-game-overlay');

  const canvas = document.getElementById('tank-game-canvas');
  const ctx = canvas.getContext('2d');

  // Game configuration
  const WIDTH = 1024;
  const HEIGHT = 576;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // Key tracking
  const keys = {};

  const handleKeyDown = (e) => {
    const blockedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', '/', 'e', 'r', 'Shift'];
    if (blockedKeys.includes(e.key) || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      e.preventDefault();
    }
    keys[e.code] = true;
    keys[e.key.toLowerCase()] = true;
  };

  const handleKeyUp = (e) => {
    keys[e.code] = false;
    keys[e.key.toLowerCase()] = false;
  };

  window.addEventListener('keydown', handleKeyDown, { passive: false });
  window.addEventListener('keyup', handleKeyUp);

  // Mouse tracking
  let mouseX = 0;
  let mouseY = 0;
  const handleMouseMove = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
  };

  // Click tracking
  let leftClicked = false;
  let rightClicked = false;
  const handleMouseDown = (e) => {
    if (!gameActive || !isOnline) return;
    e.preventDefault();
    if (e.button === 0) leftClicked = true;
    if (e.button === 2) rightClicked = true;
  };

  overlay.addEventListener('mousemove', handleMouseMove);
  overlay.addEventListener('contextmenu', handleContextMenu);
  overlay.addEventListener('mousedown', handleMouseDown);

  // Selected Power-ups
  const p1Powerups = { bounce: false, speed: false, cooldown: false, size: false, engine: false, shield: false };
  const p2Powerups = { bounce: false, speed: false, cooldown: false, size: false, engine: false, shield: false };
  const onlinePowerups = { bounce: false, speed: false, cooldown: false, size: false, engine: false, shield: false };
  let selectedMap = 'pillars';

  // Setup UI Toggles for Multi-Selection
  function setupPowerupToggles(className, stateObject) {
    const buttons = document.querySelectorAll(className);
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const powerKey = btn.getAttribute('data-power');
        stateObject[powerKey] = !stateObject[powerKey]; // Toggle state
        if (stateObject[powerKey]) {
          btn.classList.add('selected');
        } else {
          btn.classList.remove('selected');
        }
      });
    });
  }

  setupPowerupToggles('.p1-power-btn', p1Powerups);
  setupPowerupToggles('.p2-power-btn', p2Powerups);
  setupPowerupToggles('.online-power-btn', onlinePowerups);

  // Setup Map Selector
  const mapButtons = document.querySelectorAll('.map-btn');
  mapButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      mapButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedMap = btn.getAttribute('data-map');
      generateMap();
    });
  });

  // Score, Multiplayer, & Round-end states
  let scores = { p1: 0, p2: 0 };
  let gameActive = false;
  let roundEnded = false; // Freeze state to avoid double kills
  let animationId = null;
  let isOnline = false;
  let socket = null;
  let myRole = null; // 1 or 2
  let currentRoomId = null;

  // Rematch Flags
  let rematchRequested = false;
  let opponentRematchRequested = false;

  // Particle System
  let particles = [];
  function createExplosion(x, y, color, count = 20, sizeMultiplier = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random() * 4.5) * sizeMultiplier;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: (1 + Math.random() * 4) * sizeMultiplier,
        color: color,
        alpha: 1,
        decay: 0.015 + Math.random() * 0.02
      });
    }
  }

  // Screen shake
  let screenShake = 0;
  function triggerShake(amt) {
    screenShake = Math.max(screenShake, amt);
  }

  // Obstacles (Arenas)
  let obstacles = [];
  function generateMap() {
    obstacles = [];
    const wallThickness = 12;
    obstacles.push({ x: 0, y: 0, w: WIDTH, h: wallThickness });
    obstacles.push({ x: 0, y: HEIGHT - wallThickness, w: WIDTH, h: wallThickness });
    obstacles.push({ x: 0, y: 0, w: wallThickness, h: HEIGHT });
    obstacles.push({ x: WIDTH - wallThickness, y: 0, w: wallThickness, h: HEIGHT });

    if (selectedMap === 'pillars') {
      const blocks = [
        { x: WIDTH / 2 - 25, y: HEIGHT / 2 - 80, w: 50, h: 160 },
        { x: WIDTH / 2 - 120, y: 80, w: 240, h: 24 },
        { x: WIDTH / 2 - 120, y: HEIGHT - 104, w: 240, h: 24 },
        { x: 180, y: 150, w: 40, h: 120 },
        { x: WIDTH - 220, y: 150, w: 40, h: 120 },
        { x: 180, y: HEIGHT - 270, w: 40, h: 120 },
        { x: WIDTH - 220, y: HEIGHT - 270, w: 40, h: 120 }
      ];
      obstacles.push(...blocks);
    } else if (selectedMap === 'cross') {
      const blocks = [
        { x: WIDTH / 2 - 120, y: HEIGHT / 2 - 12, w: 240, h: 24 },
        { x: WIDTH / 2 - 12, y: HEIGHT / 2 - 120, w: 24, h: 240 },
        { x: 160, y: 120, w: 60, h: 60 },
        { x: WIDTH - 220, y: 120, w: 60, h: 60 },
        { x: 160, y: HEIGHT - 180, w: 60, h: 60 },
        { x: WIDTH - 220, y: HEIGHT - 180, w: 60, h: 60 }
      ];
      obstacles.push(...blocks);
    } else if (selectedMap === 'corridors') {
      const blocks = [
        { x: 120, y: 140, w: 320, h: 24 },
        { x: WIDTH - 440, y: 140, w: 320, h: 24 },
        { x: 120, y: HEIGHT - 164, w: 320, h: 24 },
        { x: WIDTH - 440, y: HEIGHT - 164, w: 320, h: 24 },
        { x: WIDTH / 2 - 12, y: HEIGHT / 2 - 50, w: 24, h: 100 }
      ];
      obstacles.push(...blocks);
    }
  }

  // Tank class
  class Tank {
    constructor(x, y, angle, color, id, powerupsObj) {
      this.id = id;
      this.x = x;
      this.y = y;
      this.angle = angle; // Body direction
      this.turretAngle = angle; // Gun barrel direction
      this.color = color;
      this.width = 34;
      this.height = 24;
      this.speed = 0;
      this.powerups = { ...powerupsObj };

      const hasEngineBuff = this.powerups.engine;
      this.maxSpeed = hasEngineBuff ? 4.8 : 3.2;
      this.accel = hasEngineBuff ? 0.22 : 0.15;
      this.friction = 0.08;
      this.rotSpeed = 0.055;

      this.health = 100;
      this.bullets = [];
      this.specialCooldown = 0;
      this.normalCooldown = 0;
    }

    update() {
      if (roundEnded) {
        this.speed = 0;
        return;
      }

      if (this.specialCooldown > 0) this.specialCooldown--;
      if (this.normalCooldown > 0) this.normalCooldown--;

      // If online and not my tank, update is handled by websocket broadcasts
      if (isOnline && myRole !== this.id) {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        return;
      }

      let moveForward = false;
      let moveBackward = false;
      let rotateLeft = false;
      let rotateRight = false;
      let fireNormal = false;
      let fireSpecial = false;

      // ONLINE: Mouse aiming & WASD movement
      if (isOnline) {
        const rect = canvas.getBoundingClientRect();
        const canvasMouseX = (mouseX - rect.left) * (canvas.width / rect.width);
        const canvasMouseY = (mouseY - rect.top) * (canvas.height / rect.height);
        this.turretAngle = Math.atan2(canvasMouseY - this.y, canvasMouseX - this.x);

        let dx = 0;
        let dy = 0;
        if (keys['w']) dy -= 1;
        if (keys['s']) dy += 1;
        if (keys['a']) dx -= 1;
        if (keys['d']) dx += 1;

        if (dx !== 0 || dy !== 0) {
          this.angle = Math.atan2(dy, dx);
          this.speed = this.maxSpeed;
          const nextX = this.x + Math.cos(this.angle) * this.speed;
          const nextY = this.y + Math.sin(this.angle) * this.speed;

          if (!this.checkWallCollision(nextX, nextY)) {
            this.x = nextX;
            this.y = nextY;
          }
        } else {
          this.speed = 0;
        }

        if (leftClicked) {
          this.shoot(false);
          leftClicked = false;
        }
        if (rightClicked) {
          this.shoot(true);
          rightClicked = false;
        }

      } else {
        // LOCAL CO-OP CONTROLS
        if (this.id === 1) {
          if (keys['w']) moveForward = true;
          if (keys['s']) moveBackward = true;
          if (keys['a']) rotateLeft = true;
          if (keys['d']) rotateRight = true;
          if (keys['e']) fireNormal = true;
          if (keys['r']) fireSpecial = true;
        } else {
          if (keys['ArrowUp']) moveForward = true;
          if (keys['ArrowDown']) moveBackward = true;
          if (keys['ArrowLeft']) rotateLeft = true;
          if (keys['ArrowRight']) rotateRight = true;
          if (keys['ShiftLeft'] || keys['ShiftRight'] || keys['shift']) fireNormal = true;
          if (keys['/']) fireSpecial = true;
        }

        if (rotateLeft) this.angle -= this.rotSpeed;
        if (rotateRight) this.angle += this.rotSpeed;

        this.turretAngle = this.angle;

        if (moveForward) {
          this.speed = Math.min(this.speed + this.accel, this.maxSpeed);
        } else if (moveBackward) {
          this.speed = Math.max(this.speed - this.accel, -this.maxSpeed * 0.6);
        } else {
          if (this.speed > 0) this.speed = Math.max(0, this.speed - this.friction);
          if (this.speed < 0) this.speed = Math.min(0, this.speed + this.friction);
        }

        const nextX = this.x + Math.cos(this.angle) * this.speed;
        const nextY = this.y + Math.sin(this.angle) * this.speed;

        if (!this.checkWallCollision(nextX, nextY)) {
          this.x = nextX;
          this.y = nextY;
        } else {
          this.speed = -this.speed * 0.4;
        }

        if (fireNormal) this.shoot(false);
        if (fireSpecial) this.shoot(true);
      }

      // Send position update online
      if (isOnline && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'state',
          roomId: currentRoomId,
          role: myRole,
          x: this.x,
          y: this.y,
          angle: this.angle,
          turretAngle: this.turretAngle,
          speed: this.speed
        }));
      }
    }

    checkWallCollision(x, y) {
      const halfW = this.width / 2;
      const halfH = this.height / 2;
      for (const obs of obstacles) {
        if (x - halfW < obs.x + obs.w &&
            x + halfW > obs.x &&
            y - halfH < obs.y + obs.h &&
            y + halfH > obs.y) {
          return true;
        }
      }
      return false;
    }

    shoot(isSpecial, remote = false) {
      if (roundEnded) return;

      const hasCooldownBuff = this.powerups.cooldown;
      const hasSpeedBuff = this.powerups.speed;
      const hasBounceBuff = this.powerups.bounce;
      const hasSizeBuff = this.powerups.size;

      if (isSpecial) {
        if (this.specialCooldown > 0) return;
        this.specialCooldown = hasCooldownBuff ? 100 : 180;

        const bulletAngle = this.turretAngle;
        const muzzleX = this.x + Math.cos(bulletAngle) * (this.width / 2 + (hasSizeBuff ? 16 : 8));
        const muzzleY = this.y + Math.sin(bulletAngle) * (this.width / 2 + (hasSizeBuff ? 16 : 8));
        this.bullets.push({
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(bulletAngle) * (hasSpeedBuff ? 8.5 : 5),
          vy: Math.sin(bulletAngle) * (hasSpeedBuff ? 8.5 : 5),
          radius: hasSizeBuff ? 20 : 8,
          isSpecial: true,
          damage: hasSizeBuff ? 56 : 40,
          bounces: 0,
          color: this.color
        });
        createExplosion(muzzleX, muzzleY, this.color, 8, 0.7);
        triggerShake(12);

        if (isOnline && !remote && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'shoot',
            roomId: currentRoomId,
            role: myRole,
            isSpecial: true
          }));
        }
      } else {
        if (this.normalCooldown > 0) return;
        this.normalCooldown = hasCooldownBuff ? 12 : 22;

        const bulletAngle = this.turretAngle;
        const muzzleX = this.x + Math.cos(bulletAngle) * (this.width / 2 + (hasSizeBuff ? 12 : 8));
        const muzzleY = this.y + Math.sin(bulletAngle) * (this.width / 2 + (hasSizeBuff ? 12 : 8));

        const normalSpeed = hasSpeedBuff ? 12.8 : 7.5;
        this.bullets.push({
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(bulletAngle) * normalSpeed,
          vy: Math.sin(bulletAngle) * normalSpeed,
          radius: hasSizeBuff ? 9 : 3.5,
          isSpecial: false,
          damage: hasSizeBuff ? 21 : 15,
          bounces: hasBounceBuff ? 99999 : 2,
          color: '#ffffff'
        });
        createExplosion(muzzleX, muzzleY, '#ffffff', 4, 0.4);
        triggerShake(4);

        if (isOnline && !remote && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'shoot',
            roomId: currentRoomId,
            role: myRole,
            isSpecial: false
          }));
        }
      }
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Draw tank body (rotated by body angle)
      ctx.save();
      ctx.rotate(this.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-this.width / 2 + 4, -this.height / 2 + 4, this.width, this.height);
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.fillStyle = '#222227';
      ctx.fillRect(-this.width / 2 - 2, -this.height / 2 - 3, this.width + 4, 4);
      ctx.fillRect(-this.width / 2 - 2, this.height / 2 - 1, this.width + 4, 4);
      ctx.restore();

      // Draw turret/barrel (rotated independently by turretAngle)
      ctx.save();
      ctx.rotate(this.turretAngle);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -3, this.width / 2 + 8, 6);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }
  }

  let p1, p2;

  function resetRound() {
    p1 = new Tank(100, HEIGHT / 2, 0, '#00ffcc', 1, p1Powerups);
    p2 = new Tank(WIDTH - 100, HEIGHT / 2, Math.PI, '#ff3366', 2, p2Powerups);
    document.getElementById('p1-health').style.width = '100%';
    document.getElementById('p2-health').style.width = '100%';
    roundEnded = false;
  }

  function checkBulletCollisions(tank, enemy) {
    if (roundEnded) return;

    for (let i = tank.bullets.length - 1; i >= 0; i--) {
      const b = tank.bullets[i];
      b.x += b.vx;
      b.y += b.vy;

      let hitWall = false;
      for (const obs of obstacles) {
        if (b.x > obs.x && b.x < obs.x + obs.w &&
            b.y > obs.y && b.y < obs.y + obs.h) {
          hitWall = true;
          const distToLeft = Math.abs(b.x - obs.x);
          const distToRight = Math.abs(b.x - (obs.x + obs.w));
          const distToTop = Math.abs(b.y - obs.y);
          const distToBottom = Math.abs(b.y - (obs.y + obs.h));
          const min = Math.min(distToLeft, distToRight, distToTop, distToBottom);

          if (min === distToLeft || min === distToRight) {
            b.vx = -b.vx;
          } else {
            b.vy = -b.vy;
          }
          break;
        }
      }

      if (hitWall) {
        if (b.bounces > 0) {
          b.bounces--;
          createExplosion(b.x, b.y, b.color, 4, 0.4);
        } else {
          createExplosion(b.x, b.y, b.color, b.isSpecial ? 15 : 6, b.isSpecial ? 1.2 : 0.6);
          tank.bullets.splice(i, 1);
          continue;
        }
      }

      const dist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
      if (dist < enemy.width / 2 + b.radius) {
        if (!isOnline || myRole === tank.id) {
          const damageReductionMultiplier = enemy.powerups.shield ? 0.7 : 1.0;
          const netDamage = Math.round(b.damage * damageReductionMultiplier);

          enemy.health = Math.max(0, enemy.health - netDamage);
          document.getElementById(`p${enemy.id}-health`).style.width = `${enemy.health}%`;

          if (isOnline && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: 'hit',
              roomId: currentRoomId,
              role: enemy.id,
              enemyHealth: enemy.health
            }));
          }

          createExplosion(b.x, b.y, enemy.color, b.isSpecial ? 25 : 12, b.isSpecial ? 1.5 : 0.8);
          triggerShake(b.isSpecial ? 20 : 10);
          tank.bullets.splice(i, 1);

          if (enemy.health <= 0 && !roundEnded) {
            roundEnded = true; 
            p1.bullets = [];   
            p2.bullets = [];

            const winnerId = tank.id;
            scores[`p${winnerId}`]++;
            document.getElementById(`p${winnerId}-score-text`).innerText = scores[`p${winnerId}`];
            
            if (enemy) {
              createExplosion(enemy.x, enemy.y, enemy.color, 50, 2.5);
            }
            triggerShake(35);

            if (isOnline && socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: 'round_over',
                roomId: currentRoomId,
                role: enemy.id,
                scores: scores
              }));
            }

            // Fix: First to 1 kill wins match
            if (scores[`p${winnerId}`] >= 1) {
              endMatch(winnerId);
            } else {
              setTimeout(resetRound, 1200);
            }
          }
        } else {
          tank.bullets.splice(i, 1);
        }
      }
    }
  }

  function drawBullets(bullets) {
    for (const b of bullets) {
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.isSpecial ? 15 : 5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawMap() {
    ctx.fillStyle = '#1c1c24';
    ctx.strokeStyle = '#2d2d3a';
    ctx.lineWidth = 2;
    for (const obs of obstacles) {
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    }
  }

  function loop() {
    if (!gameActive) return;

    ctx.save();
    if (screenShake > 0) {
      const dx = (Math.random() - 0.5) * screenShake;
      const dy = (Math.random() - 0.5) * screenShake;
      ctx.translate(dx, dy);
      screenShake *= 0.9;
      if (screenShake < 0.2) screenShake = 0;
    }

    ctx.fillStyle = '#0f0f13';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }

    drawMap();

    // Update tanks
    if (p1) p1.update();
    if (p2) p2.update();

    // Check bullets
    if (p1 && p2) {
      checkBulletCollisions(p1, p2);
      checkBulletCollisions(p2, p1);
    }

    // Draw bullets
    if (p1) drawBullets(p1.bullets);
    if (p2) drawBullets(p2.bullets);

    // Draw tanks
    if (p1) p1.draw();
    if (p2) p2.draw();

    // Particles update and draw
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      } else {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
    animationId = requestAnimationFrame(loop);
  }

  function startLocalBattle() {
    isOnline = false;
    myRole = null;
    document.getElementById('p1-name-tag').innerText = 'P1 (WASD)';
    document.getElementById('p2-name-tag').innerText = 'P2 (ARROWS)';
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    scores = { p1: 0, p2: 0 };
    document.getElementById('p1-score-text').innerText = '0';
    document.getElementById('p2-score-text').innerText = '0';
    generateMap();
    resetRound();
    gameActive = true;
    loop();
  }

  function connectOnlineSocket() {
    const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
    return new WebSocket(wsProtocol + location.host);
  }

  function startOnlineMatchmaking(mode, roomCode) {
    isOnline = true;
    document.getElementById('start-screen').style.display = 'none';
    const lobbyScreen = document.getElementById('lobby-screen');
    const lobbyStatus = document.getElementById('lobby-status');
    const lobbyCodeBox = document.getElementById('lobby-code-box');
    lobbyScreen.style.display = 'flex';
    lobbyCodeBox.style.display = 'none';
    lobbyStatus.innerText = 'Connecting to server...';

    // Connect to whatever host served this page, over ws:// or wss://
    // depending on whether the page itself is http or https. This means
    // the same client code works for local testing and for a deployed
    // server without any manual URL editing.
    socket = connectOnlineSocket();

    socket.onopen = () => {
      if (mode === 'quick') {
        lobbyStatus.innerText = 'Searching for an opponent...';
        socket.send(JSON.stringify({ type: 'find_match' }));
      } else if (mode === 'create') {
        lobbyStatus.innerText = 'Waiting for someone to join...';
        socket.send(JSON.stringify({ type: 'create_room' }));
      } else if (mode === 'join') {
        lobbyStatus.innerText = 'Joining room...';
        socket.send(JSON.stringify({ type: 'join_room', code: roomCode }));
      }
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'room_created') {
        lobbyStatus.innerText = 'Waiting for someone to join...';
        lobbyCodeBox.style.display = 'block';
        document.getElementById('lobby-code-text').innerText = data.code;
        return;
      }

      if (data.type === 'join_error') {
        alert(data.message || 'Could not join that room.');
        cleanupSocketsAndExit();
        return;
      }

      if (data.type === 'match_found') {
        myRole = data.role;
        currentRoomId = data.roomId;
        lobbyScreen.style.display = 'none';

        if (myRole === 1) {
          Object.assign(p1Powerups, onlinePowerups);
          document.getElementById('p1-name-tag').innerText = 'YOU (P1/WASD)';
          document.getElementById('p2-name-tag').innerText = 'ENEMY (P2)';

          socket.send(JSON.stringify({
            type: 'init_map',
            roomId: currentRoomId,
            map: selectedMap
          }));
        } else {
          Object.assign(p2Powerups, onlinePowerups);
          document.getElementById('p1-name-tag').innerText = 'ENEMY (P1)';
          document.getElementById('p2-name-tag').innerText = 'YOU (P2/WASD)';
        }

        socket.send(JSON.stringify({
          type: 'init_powerup',
          roomId: currentRoomId,
          role: myRole,
          powerups: onlinePowerups
        }));

        scores = { p1: 0, p2: 0 };
        document.getElementById('p1-score-text').innerText = '0';
        document.getElementById('p2-score-text').innerText = '0';
        generateMap();
        resetRound();
        gameActive = true;
        loop();
      }

      if (data.type === 'init_map') {
        selectedMap = data.map;
        generateMap();
      }

      if (data.type === 'init_powerup') {
        if (data.role === 1) {
          Object.assign(p1Powerups, data.powerups);
          if (p1) p1.powerups = { ...data.powerups };
        } else {
          Object.assign(p2Powerups, data.powerups);
          if (p2) p2.powerups = { ...data.powerups };
        }
      }

      if (data.type === 'state') {
        const remoteTank = data.role === 1 ? p1 : p2;
        if (remoteTank) {
          remoteTank.x = data.x;
          remoteTank.y = data.y;
          remoteTank.angle = data.angle;
          remoteTank.turretAngle = data.turretAngle;
          remoteTank.speed = data.speed;
        }
      }

      if (data.type === 'shoot') {
        const remoteTank = data.role === 1 ? p1 : p2;
        if (remoteTank) {
          remoteTank.shoot(data.isSpecial, true);
        }
      }

      if (data.type === 'hit') {
        const hitTank = data.role === 1 ? p1 : p2;
        if (hitTank) {
          hitTank.health = data.enemyHealth;
          document.getElementById(`p${data.role}-health`).style.width = `${hitTank.health}%`;
        }
      }

      if (data.type === 'round_over') {
        roundEnded = true; 
        if (p1) p1.bullets = [];   
        if (p2) p2.bullets = [];

        scores = data.scores;
        document.getElementById('p1-score-text').innerText = scores.p1;
        document.getElementById('p2-score-text').innerText = scores.p2;

        const loserTank = data.role === 1 ? p1 : p2;
        if (loserTank) {
          createExplosion(loserTank.x, loserTank.y, loserTank.color, 50, 2.5);
        }
        triggerShake(35);

        // Fix: First to 1 kill wins match
        const winnerId = data.role === 1 ? 2 : 1;
        if (scores[`p${winnerId}`] >= 1) {
          endMatch(winnerId);
        } else {
          setTimeout(resetRound, 1200);
        }
      }

      // Online Rematch Sync handlers
      if (data.type === 'rematch_intent') {
        opponentRematchRequested = true;
        if (rematchRequested) {
          triggerOnlineRematch();
        }
      }
    };

    socket.onerror = (err) => {
      alert('Could not connect to the online server. Make sure the server is running (`node server.js`).');
      cleanupSocketsAndExit();
    };

    socket.onclose = () => {
      if (gameActive) {
        alert('Connection closed.');
        cleanupSocketsAndExit();
      }
    };
  }

  function handleRematchClick() {
    if (!isOnline) {
      // Local Rematch - Reset scores and start immediately with same powerups and map
      scores = { p1: 0, p2: 0 };
      document.getElementById('p1-score-text').innerText = '0';
      document.getElementById('p2-score-text').innerText = '0';
      document.getElementById('game-over-screen').style.display = 'none';
      generateMap();
      resetRound();
      gameActive = true;
      loop();
    } else {
      // Online Rematch intent broadcast
      if (socket && socket.readyState === WebSocket.OPEN) {
        rematchRequested = true;
        const rematchBtn = document.getElementById('rematch-btn');
        rematchBtn.innerText = 'Waiting...';
        rematchBtn.style.opacity = '0.6';

        socket.send(JSON.stringify({
          type: 'rematch_intent',
          roomId: currentRoomId,
          role: myRole
        }));

        if (opponentRematchRequested) {
          triggerOnlineRematch();
        }
      }
    }
  }

  function triggerOnlineRematch() {
    scores = { p1: 0, p2: 0 };
    document.getElementById('p1-score-text').innerText = '0';
    document.getElementById('p2-score-text').innerText = '0';
    document.getElementById('game-over-screen').style.display = 'none';

    // Reset rematch flags
    rematchRequested = false;
    opponentRematchRequested = false;

    // Reset button text
    const rematchBtn = document.getElementById('rematch-btn');
    rematchBtn.innerText = 'REMATCH';
    rematchBtn.style.opacity = '1';

    generateMap();
    resetRound();
    gameActive = true;
    loop();
  }

  function handleMainMenuClick() {
    cleanupSocketsAndExit();
  }

  function cleanupSocketsAndExit() {
    gameActive = false;
    if (animationId) cancelAnimationFrame(animationId);
    if (socket) {
      socket.close();
      socket = null;
    }
    rematchRequested = false;
    opponentRematchRequested = false;

    const rematchBtn = document.getElementById('rematch-btn');
    rematchBtn.innerText = 'REMATCH';
    rematchBtn.style.opacity = '1';

    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('lobby-code-box').style.display = 'none';
    document.getElementById('join-room-input').value = '';
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
  }

  function endMatch(winnerId) {
    gameActive = false;
    if (animationId) cancelAnimationFrame(animationId);
    document.getElementById('winner-text').innerText = `PLAYER ${winnerId} WINS!`;
    document.getElementById('game-over-screen').style.display = 'flex';
  }

  // Setup buttons
  document.getElementById('start-btn').addEventListener('click', startLocalBattle);
  document.getElementById('online-btn').addEventListener('click', () => startOnlineMatchmaking('quick'));
  document.getElementById('create-room-btn').addEventListener('click', () => startOnlineMatchmaking('create'));
  document.getElementById('join-room-btn').addEventListener('click', () => {
    const input = document.getElementById('join-room-input');
    const code = input.value.trim();
    if (!code) {
      input.focus();
      return;
    }
    startOnlineMatchmaking('join', code);
  });
  document.getElementById('join-room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('join-room-btn').click();
  });
  document.getElementById('cancel-lobby-btn').addEventListener('click', cleanupSocketsAndExit);
  
  document.getElementById('rematch-btn').addEventListener('click', handleRematchClick);
  document.getElementById('menu-btn').addEventListener('click', handleMainMenuClick);

  generateMap();

})();
