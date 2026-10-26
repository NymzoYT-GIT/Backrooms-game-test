import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* =========================================
   THE BACKROOMS — GAME ENGINE
========================================= */

const container = document.getElementById("game-container");
const startScreen = document.getElementById("start-screen");
const startButton = document.getElementById("start-button");
const hud = document.getElementById("hud");
const statusText = document.getElementById("status");
const monsterWarning = document.getElementById("monster-warning");
const messageText = document.getElementById("message");
const errorScreen = document.getElementById("error-screen");
const errorMessage = document.getElementById("error-message");

const CELL = 5;
const GRID_SIZE = 31;
const WALL_HEIGHT = 4;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;

let scene;
let camera;
let renderer;
let clock;

let started = false;
let gameOver = false;
let won = false;
let pointerLocked = false;

let maze = [];
let walls = [];
let floor;
let ceiling;
let monster;
let monsterModel;

let elapsed = 0;
let monsterDistance = 100;
let messageTimer = 0;

const keys = {};
let audioContext = null;
let nextFootstepTime = 0;

const velocity = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

const player = {
  x: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  speed: 4.5,
  sprintSpeed: 7,
  stamina: 100
};

const textures = {
  wall: "./assets/textures/wall.jpeg",
  floor: "./assets/textures/floor.jpeg",
  roof: "./assets/textures/roof.jpeg"
};

const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

/* =========================================
   INITIALIZE
========================================= */

function initialize() {
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x17150e);
    scene.fog = new THREE.Fog(0x17150e, 8, 38);

    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      150
    );

    renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "low-power"
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 1.5)
    );

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    const ambient = new THREE.HemisphereLight(
      0xffedb5,
      0x252014,
      1.25
    );

    scene.add(ambient);

    const mainLight = new THREE.PointLight(
      0xffe6a0,
      2.2,
      24
    );

    mainLight.position.set(0, 3.4, 0);
    scene.add(mainLight);

    buildWorld();
    setPlayerStart();
    createMonster();

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    document.addEventListener("mousemove", onMouseMove);

    document.addEventListener(
      "pointerlockchange",
      onPointerLockChange
    );

    startButton.addEventListener("click", () => {
      startGame();
    });

    document.getElementById("reload-button").addEventListener(
      "click",
      () => window.location.reload()
    );

    requestAnimationFrame(animate);
  } catch (error) {
    showError(error);
  }
}

/* =========================================
   TEXTURES
========================================= */

function loadTexture(path, repeatX = 1, repeatY = 1) {
  const texture = textureLoader.load(
    path,
    undefined,
    undefined,
    () => {
      console.warn(
        "Texture unavailable; using fallback:",
        path
      );
    }
  );

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

/* =========================================
   MAZE GENERATION
========================================= */

function generateMaze() {
  maze = Array.from(
    { length: GRID_SIZE },
    () => Array(GRID_SIZE).fill(1)
  );

  const stack = [{ x: 1, z: 1 }];

  maze[1][1] = 0;

  const directions = [
    { x: 0, z: -2 },
    { x: 2, z: 0 },
    { x: 0, z: 2 },
    { x: -2, z: 0 }
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];

    const options = directions.filter(direction => {
      const nx = current.x + direction.x;
      const nz = current.z + direction.z;

      return (
        nx > 0 &&
        nz > 0 &&
        nx < GRID_SIZE - 1 &&
        nz < GRID_SIZE - 1 &&
        maze[nz][nx] === 1
      );
    });

    if (options.length === 0) {
      stack.pop();
      continue;
    }

    const direction = options[
      Math.floor(Math.random() * options.length)
    ];

    const nx = current.x + direction.x;
    const nz = current.z + direction.z;

    maze[current.z + direction.z / 2][
      current.x + direction.x / 2
    ] = 0;

    maze[nz][nx] = 0;

    stack.push({
      x: nx,
      z: nz
    });
  }

  // Create an open exit area.
  for (
    let z = GRID_SIZE - 5;
    z < GRID_SIZE - 1;
    z++
  ) {
    for (
      let x = GRID_SIZE - 5;
      x < GRID_SIZE - 1;
      x++
    ) {
      maze[z][x] = 0;
    }
  }

  // Make a path toward the exit.
  for (
    let x = GRID_SIZE - 7;
    x < GRID_SIZE - 1;
    x++
  ) {
    maze[GRID_SIZE - 3][x] = 0;
  }
}

/* =========================================
   BUILD THE 3D WORLD
========================================= */

function buildWorld() {
  generateMaze();

  const worldWidth = GRID_SIZE * CELL;
  const offset = worldWidth / 2;

  const wallTexture = loadTexture(
    textures.wall,
    2,
    1
  );

  const floorTexture = loadTexture(
    textures.floor,
    GRID_SIZE,
    GRID_SIZE
  );

  const roofTexture = loadTexture(
    textures.roof,
    GRID_SIZE,
    GRID_SIZE
  );

  const wallMaterial = new THREE.MeshStandardMaterial({
    map: wallTexture,
    color: 0xc4b66d,
    roughness: 0.96
  });

  const floorMaterial = new THREE.MeshStandardMaterial({
    map: floorTexture,
    color: 0xaaa18a,
    roughness: 1
  });

  const roofMaterial = new THREE.MeshStandardMaterial({
    map: roofTexture,
    color: 0xbab38c,
    roughness: 1,
    side: THREE.DoubleSide
  });

  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(
      worldWidth,
      worldWidth
    ),
    floorMaterial
  );

  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.position.x = 0;
  floor.position.z = 0;

  scene.add(floor);

  ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(
      worldWidth,
      worldWidth
    ),
    roofMaterial
  );

  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_HEIGHT;

  scene.add(ceiling);

  const wallGeometry = new THREE.BoxGeometry(
    CELL,
    WALL_HEIGHT,
    CELL
  );

  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (maze[z][x] !== 1) continue;

      const wall = new THREE.Mesh(
        wallGeometry,
        wallMaterial
      );

      wall.position.set(
        x * CELL - offset + CELL / 2,
        WALL_HEIGHT / 2,
        z * CELL - offset + CELL / 2
      );

      wall.userData.gridX = x;
      wall.userData.gridZ = z;

      scene.add(wall);
      walls.push(wall);
    }
  }

  // Exit marker.
  const exit = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 3.2, 0.3),
    new THREE.MeshStandardMaterial({
      color: 0x45ff9a,
      emissive: 0x087b32,
      emissiveIntensity: 2
    })
  );

  exit.position.set(
    (GRID_SIZE - 2) * CELL -
      offset +
      CELL / 2,
    1.6,
    (GRID_SIZE - 2) * CELL -
      offset +
      CELL / 2
  );

  scene.add(exit);
  scene.userData.exit = exit;
}

/* =========================================
   PLAYER
========================================= */

function setPlayerStart() {
  const offset = (GRID_SIZE * CELL) / 2;

  player.x = CELL * 1.5 - offset;
  player.z = CELL * 1.5 - offset;

  player.yaw = 0;
  player.pitch = 0;

  updateCamera();
}

function updateCamera() {
  camera.position.set(
    player.x,
    PLAYER_HEIGHT,
    player.z
  );

  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function isBlocked(x, z) {
  const offset = (GRID_SIZE * CELL) / 2;

  const gridX = Math.floor(
    (x + offset) / CELL
  );

  const gridZ = Math.floor(
    (z + offset) / CELL
  );

  if (
    gridX < 0 ||
    gridZ < 0 ||
    gridX >= GRID_SIZE ||
    gridZ >= GRID_SIZE
  ) {
    return true;
  }

  return maze[gridZ][gridX] === 1;
}

function movePlayer(dx, dz) {
  const nextX = player.x + dx;
  const nextZ = player.z + dz;

  if (!isBlocked(nextX, player.z)) {
    player.x = nextX;
  }

  if (!isBlocked(player.x, nextZ)) {
    player.z = nextZ;
  }
}

/* =========================================
   MONSTER
========================================= */

function createMonster() {
  monster = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x171317,
    roughness: 1
  });

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      0.55,
      1.1,
      4,
      8
    ),
    bodyMaterial
  );

  body.position.y = 1.25;
  monster.add(body);

  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000
  });

  for (const x of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.075,
        8,
        8
      ),
      eyeMaterial
    );

    eye.position.set(
      x,
      1.75,
      -0.48
    );

    monster.add(eye);
  }

  const offset = (GRID_SIZE * CELL) / 2;

  monster.position.set(
    (GRID_SIZE - 4) * CELL -
      offset +
      CELL / 2,
    0,
    (GRID_SIZE - 4) * CELL -
      offset +
      CELL / 2
  );

  scene.add(monster);

  // Load your custom monster model.
  gltfLoader.load(
    "./assets/models/Lonely_Wanderer.glb",

    gltf => {
      if (!monster) return;

      monsterModel = gltf.scene;

      monsterModel.scale.setScalar(1.0);
      monsterModel.position.set(0, 0, 0);

      // Remove the placeholder body and eyes.
      while (monster.children.length > 0) {
        monster.remove(monster.children[0]);
      }

      monster.add(monsterModel);
    },

    undefined,

    error => {
      console.warn(
        "Custom monster model unavailable; using placeholder.",
        error
      );
    }
  );
}

function updateMonster(delta) {
  if (!monster || !started || gameOver || won) {
    return;
  }

  // Initialize roaming state the first time this runs.
  if (!monster.userData.roaming) {
    monster.userData.roaming = true;
    monster.userData.targetX = monster.position.x;
    monster.userData.targetZ = monster.position.z;
    monster.userData.turnTimer = 0;
    monster.userData.roamSpeed = 1.6;
    chooseMonsterDestination();
  }

  const data = monster.userData;

  data.turnTimer -= delta;

  const dx = data.targetX - monster.position.x;
  const dz = data.targetZ - monster.position.z;
  const distanceToTarget = Math.hypot(dx, dz);

  // Pick a new destination when close to the current one.
  if (distanceToTarget < 0.7 || data.turnTimer <= 0) {
    chooseMonsterDestination();
  }

  const moveX = data.targetX - monster.position.x;
  const moveZ = data.targetZ - monster.position.z;
  const distance = Math.hypot(moveX, moveZ);

  if (distance > 0.001) {
    const directionX = moveX / distance;
    const directionZ = moveZ / distance;
    const step = data.roamSpeed * delta;

    const nextX = monster.position.x + directionX * step;
    const nextZ = monster.position.z + directionZ * step;

    // Check movement against the maze walls.
    if (!isBlocked(nextX, monster.position.z)) {
      monster.position.x = nextX;
    }

    if (!isBlocked(monster.position.x, nextZ)) {
      monster.position.z = nextZ;
    }

    // Face the direction of travel.
    monster.rotation.y = Math.atan2(directionX, directionZ);
  }

  // Keep track of how close the monster is to the player.
  const playerDX = player.x - monster.position.x;
  const playerDZ = player.z - monster.position.z;

  monsterDistance = Math.hypot(playerDX, playerDZ);

  // The monster can still catch the player if they get too close.
  if (monsterDistance < 1.3) {
    endGame(false);
  }

  if (monsterDistance < 12) {
    monsterWarning.textContent = "IT KNOWS YOU ARE HERE";
  } else {
    monsterWarning.textContent = "";
  }
}

function chooseMonsterDestination() {
  if (!monster) return;

  const data = monster.userData;
  const offset = (GRID_SIZE * CELL) / 2;

  // Find an open maze cell for the monster to walk toward.
  for (let attempt = 0; attempt < 60; attempt++) {
    const gridX = 1 + Math.floor(
      Math.random() * (GRID_SIZE - 2)
    );

    const gridZ = 1 + Math.floor(
      Math.random() * (GRID_SIZE - 2)
    );

    if (maze[gridZ][gridX] !== 0) continue;

    const targetX = gridX * CELL - offset + CELL / 2;
    const targetZ = gridZ * CELL - offset + CELL / 2;

    // Avoid choosing a destination right next to the monster.
    if (
      Math.hypot(
        targetX - monster.position.x,
        targetZ - monster.position.z
      ) < CELL * 2
    ) {
      continue;
    }

    data.targetX = targetX;
    data.targetZ = targetZ;

    // Pause briefly before selecting another destination.
    data.turnTimer = 4 + Math.random() * 4;

    return;
  }

  // If no suitable cell was found, try again shortly.
  data.turnTimer = 1;
}

/* =========================================
   FOOTSTEP AUDIO
========================================= */

function playFootstep() {
  if (!audioContext) return;

  // If Chrome suspended audio, request playback.
  // A later step will play once the audio is running.
  if (audioContext.state !== "running") {
    audioContext.resume().catch(error => {
      console.warn(
        "Could not resume game audio:",
        error
      );
    });

    return;
  }

  const now = audioContext.currentTime;
  const duration = 0.11;

  // Generate a short noise sound.
  // This does not require an external audio file.
  const sampleCount = Math.max(
    1,
    Math.floor(
      audioContext.sampleRate * duration
    )
  );

  const noiseBuffer = audioContext.createBuffer(
    1,
    sampleCount,
    audioContext.sampleRate
  );

  const noiseData = noiseBuffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i++) {
    noiseData[i] =
      (Math.random() * 2 - 1) *
      (1 - i / sampleCount);
  }

  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const noiseGain = audioContext.createGain();

  noise.buffer = noiseBuffer;

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(700, now);

  noiseGain.gain.setValueAtTime(
    0.0001,
    now
  );

  noiseGain.gain.exponentialRampToValueAtTime(
    0.10,
    now + 0.008
  );

  noiseGain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + duration
  );

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(audioContext.destination);

  noise.start(now);
  noise.stop(now + duration);

  // Add a low thump beneath the noise.
  const oscillator = audioContext.createOscillator();
  const thumpGain = audioContext.createGain();

  oscillator.type = "sine";

  oscillator.frequency.setValueAtTime(
    95,
    now
  );

  oscillator.frequency.exponentialRampToValueAtTime(
    42,
    now + duration
  );

  thumpGain.gain.setValueAtTime(
    0.0001,
    now
  );

  thumpGain.gain.exponentialRampToValueAtTime(
    0.12,
    now + 0.01
  );

  thumpGain.gain.exponentialRampToValueAtTime(
    0.0001,
    now + duration
  );

  oscillator.connect(thumpGain);
  thumpGain.connect(audioContext.destination);

  oscillator.start(now);
  oscillator.stop(now + duration);
}

/* =========================================
   GAME CONTROLS
========================================= */

function startGame() {
  if (started) return;

  started = true;
  gameOver = false;
  won = false;
  elapsed = 0;
  nextFootstepTime = 0;

  // Initialize audio from the Start button click.
  try {
    if (!audioContext) {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      if (AudioContextClass) {
        audioContext = new AudioContextClass();
      }
    }

    if (
      audioContext &&
      audioContext.state === "suspended"
    ) {
      audioContext.resume().catch(error => {
        console.warn(
          "Could not resume game audio:",
          error
        );
      });
    }
  } catch (error) {
    console.warn(
      "Game audio could not be initialized:",
      error
    );
  }

  startScreen.classList.add("hidden");
  errorScreen.classList.add("hidden");
  hud.classList.remove("hidden");

  showMessage("Find the exit. Keep moving.");

  renderer.domElement.requestPointerLock?.();
}

function onPointerLockChange() {
  pointerLocked =
    document.pointerLockElement ===
    renderer.domElement;
}

function onMouseMove(event) {
  if (
    !started ||
    !pointerLocked ||
    gameOver ||
    won
  ) {
    return;
  }

  player.yaw -= event.movementX * 0.002;
  player.pitch -= event.movementY * 0.002;

  player.pitch = THREE.MathUtils.clamp(
    player.pitch,
    -1.45,
    1.45
  );

  updateCamera();
}

function onKeyDown(event) {
  keys[event.code] = true;

  if (
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "Space"
    ].includes(event.code)
  ) {
    event.preventDefault();
  }

  if (
    event.code === "Escape" &&
    started &&
    !gameOver &&
    !won
  ) {
    showMessage(
      "Click the game to resume looking around."
    );
  }

  if (
    event.code === "KeyR" &&
    (gameOver || won)
  ) {
    window.location.reload();
  }
}

function onKeyUp(event) {
  keys[event.code] = false;
}

function updatePlayer(delta) {
  if (!started || gameOver || won) return;

  const movingForward =
    keys.KeyW || keys.ArrowUp
      ? 1
      : keys.KeyS || keys.ArrowDown
        ? -1
        : 0;

  const movingSideways =
    keys.KeyD || keys.ArrowRight
      ? 1
      : keys.KeyA || keys.ArrowLeft
        ? -1
        : 0;

  const moving =
    movingForward !== 0 ||
    movingSideways !== 0;

  const sprinting =
    keys.ShiftLeft ||
    keys.ShiftRight;

  let speed = player.speed;

  if (
    sprinting &&
    moving &&
    player.stamina > 0
  ) {
    speed = player.sprintSpeed;

    player.stamina = Math.max(
      0,
      player.stamina - 25 * delta
    );
  } else {
    player.stamina = Math.min(
      100,
      player.stamina + 12 * delta
    );
  }

  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);

  const moveX =
    (
      -sin * movingForward +
      cos * movingSideways
    ) *
    speed *
    delta;

  const moveZ =
    (
      -cos * movingForward -
      sin * movingSideways
    ) *
    speed *
    delta;

  const length = Math.hypot(moveX, moveZ);

  const scale =
    length > speed * delta
      ? 0.7071
      : 1;

  const previousX = player.x;
  const previousZ = player.z;

  movePlayer(
    moveX * scale,
    moveZ * scale
  );

  updateCamera();

  // Play footsteps only when the player actually moves.
  // Pressing into a wall will not keep triggering sounds.
  const distanceMoved = Math.hypot(
    player.x - previousX,
    player.z - previousZ
  );

  const actuallyMoving =
    moving &&
    distanceMoved > 0.0005;

  if (
    actuallyMoving &&
    started &&
    !gameOver &&
    !won
  ) {
    const stepInterval =
      speed === player.sprintSpeed
        ? 0.30
        : 0.45;

    const now = performance.now() / 1000;

    if (now >= nextFootstepTime) {
      playFootstep();

      nextFootstepTime =
        now + stepInterval;
    }
  } else {
    nextFootstepTime = 0;
  }

  const exit = scene.userData.exit;

  if (
    exit &&
    Math.hypot(
      player.x - exit.position.x,
      player.z - exit.position.z
    ) < 2
  ) {
    endGame(true);
  }
}

/* =========================================
   MESSAGES AND GAME STATE
========================================= */

function showMessage(text) {
  messageText.textContent = text;
  messageTimer = 3;
}

function endGame(success) {
  if (gameOver || won) return;

  if (success) {
    won = true;

    showMessage(
      "YOU ESCAPED... FOR NOW."
    );

    statusText.textContent = "EXIT FOUND";
  } else {
    gameOver = true;

    showMessage("IT FOUND YOU.");

    statusText.textContent = "YOU WERE CAUGHT";
  }

  monsterWarning.textContent = "";

  setTimeout(() => {
    if (!success) {
      startScreen.classList.remove("hidden");
      startButton.textContent = "TRY AGAIN";
    } else {
      startScreen.classList.remove("hidden");
      startButton.textContent = "PLAY AGAIN";
    }

    hud.classList.add("hidden");

    document.exitPointerLock?.();

    started = false;
  }, 1800);
}

function showError(error) {
  console.error(
    "Backrooms initialization error:",
    error
  );

  errorMessage.textContent =
    "The game could not initialize. Reload the page and check the browser console for the first error.";

  errorScreen.classList.remove("hidden");
}

/* =========================================
   RESIZE AND MAIN LOOP
========================================= */

function onResize() {
  if (!camera || !renderer) return;

  camera.aspect =
    window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
}

function animate() {
  requestAnimationFrame(animate);

  if (!renderer || !scene || !camera) return;

  const delta = Math.min(
    clock.getDelta(),
    0.05
  );

  if (started && !gameOver && !won) {
    elapsed += delta;

    updatePlayer(delta);
    updateMonster(delta);

    if (messageTimer > 0) {
      messageTimer -= delta;

      if (messageTimer <= 0) {
        messageText.textContent = "";
      }
    }
  }

  renderer.render(scene, camera);
}

/* =========================================
   START
========================================= */

initialize();
