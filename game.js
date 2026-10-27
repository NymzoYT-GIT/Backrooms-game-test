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
const reloadButton = document.getElementById("reload-button");

const CELL = 5;
const GRID_SIZE = 31;
const WALL_HEIGHT = 4;
const PLAYER_HEIGHT = 1.7;

const PLAYER_RADIUS = 0.32;
const MONSTER_RADIUS = 0.42;

// Extra space kept between a moving character and a wall.
const WALL_MARGIN = 0.035;

let scene = null;
let camera = null;
let renderer = null;
let clock = null;

let started = false;
let gameOver = false;
let won = false;
let pointerLocked = false;

let maze = [];
let walls = [];
let monster = null;
let monsterModel = null;

let monsterMixer = null;
let monsterAnimations = {};
let currentMonsterAnimation = null;

let elapsed = 0;
let monsterDistance = 100;
let messageTimer = 0;
let nextFootstepTime = 0;

const keys = {};

let audioContext = null;

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

const monsterClips = {
  idle: "Spell_Simple_Idle",
  walk: "Walk",
  run: "Run_Anime",
  jump: "Jump_air",
  land: "Jump_Land",
  attack: "OverhandThrow"
};

/* =========================================
   INITIALIZATION
========================================= */

function initialize() {
  try {
    if (!container) {
      throw new Error('Missing HTML element with id="game-container".');
    }

    if (!startScreen || !startButton) {
      throw new Error("Missing start screen or start button. Check index.html.");
    }

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
      Math.min(window.devicePixelRatio || 1, 1.5)
    );

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    scene.add(
      new THREE.HemisphereLight(0xffedb5, 0x252014, 1.25)
    );

    const mainLight = new THREE.PointLight(0xffe6a0, 2.2, 24);
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

    startButton.addEventListener("click", startGame);

    if (reloadButton) {
      reloadButton.addEventListener("click", () => {
        window.location.reload();
      });
    }

    animate();

    console.log("Backrooms initialized successfully.");
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
    error => console.warn("Could not load texture:", path, error)
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

    const direction =
      options[Math.floor(Math.random() * options.length)];

    const nx = current.x + direction.x;
    const nz = current.z + direction.z;

    maze[current.z + direction.z / 2][
      current.x + direction.x / 2
    ] = 0;

    maze[nz][nx] = 0;
    stack.push({ x: nx, z: nz });
  }

  for (let z = GRID_SIZE - 5; z < GRID_SIZE - 1; z++) {
    for (let x = GRID_SIZE - 5; x < GRID_SIZE - 1; x++) {
      maze[z][x] = 0;
    }
  }

  for (let x = GRID_SIZE - 7; x < GRID_SIZE - 1; x++) {
    maze[GRID_SIZE - 3][x] = 0;
  }
}

/* =========================================
   BUILD THE WORLD
========================================= */

function buildWorld() {
  generateMaze();
  walls = [];

  const worldWidth = GRID_SIZE * CELL;
  const offset = worldWidth / 2;

  const wallTexture = loadTexture(textures.wall, 2, 1);
  const floorTexture = loadTexture(textures.floor, GRID_SIZE, GRID_SIZE);
  const roofTexture = loadTexture(textures.roof, GRID_SIZE, GRID_SIZE);

  const wallMaterial = new THREE.MeshStandardMaterial({
    map: wallTexture,
    color: 0xc4b66d,
    roughness: 0.96,
    transparent: false,
    opacity: 1,
    depthWrite: true
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

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldWidth),
    floorMaterial
  );

  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldWidth),
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

      const wall = new THREE.Mesh(wallGeometry, wallMaterial);

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

  const exit = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 3.2, 0.3),
    new THREE.MeshStandardMaterial({
      color: 0x45ff9a,
      emissive: 0x087b32,
      emissiveIntensity: 2
    })
  );

  const exitPosition = gridToWorld(
    GRID_SIZE - 2,
    GRID_SIZE - 2
  );

  exit.position.set(exitPosition.x, 1.6, exitPosition.z);
  scene.add(exit);
  scene.userData.exit = exit;
}

/* =========================================
   WORLD / GRID CONVERSION
========================================= */

function worldToGrid(x, z) {
  const offset = (GRID_SIZE * CELL) / 2;

  return {
    x: Math.floor((x + offset) / CELL),
    z: Math.floor((z + offset) / CELL)
  };
}

function gridToWorld(x, z) {
  const offset = (GRID_SIZE * CELL) / 2;

  return {
    x: x * CELL - offset + CELL / 2,
    z: z * CELL - offset + CELL / 2
  };
}

function isGridBlocked(x, z) {
  if (
    x < 0 ||
    z < 0 ||
    x >= GRID_SIZE ||
    z >= GRID_SIZE
  ) {
    return true;
  }

  return !maze[z] || maze[z][x] !== 0;
}

function isBlocked(x, z) {
  const grid = worldToGrid(x, z);
  return isGridBlocked(grid.x, grid.z);
}

/* =========================================
   ACCURATE CIRCLE-TO-WALL COLLISION
========================================= */

// Test a character's circular footprint against each nearby wall cell.
// This allows movement throughout the corridor while keeping the body
// a small, consistent distance from walls.
function canOccupyPosition(x, z, radius = PLAYER_RADIUS) {
  const safeRadius = radius + WALL_MARGIN;
  const grid = worldToGrid(x, z);

  const cellsToCheck = Math.ceil(safeRadius / CELL) + 1;

  for (let gz = grid.z - cellsToCheck; gz <= grid.z + cellsToCheck; gz++) {
    for (let gx = grid.x - cellsToCheck; gx <= grid.x + cellsToCheck; gx++) {
      if (!isGridBlocked(gx, gz)) continue;

      // Walls are square boxes centered on grid cell centers.
      const wallCenter = gridToWorld(gx, gz);

      const minX = wallCenter.x - CELL / 2;
      const maxX = wallCenter.x + CELL / 2;
      const minZ = wallCenter.z - CELL / 2;
      const maxZ = wallCenter.z + CELL / 2;

      const closestX = THREE.MathUtils.clamp(x, minX, maxX);
      const closestZ = THREE.MathUtils.clamp(z, minZ, maxZ);

      const distanceX = x - closestX;
      const distanceZ = z - closestZ;

      if (
        distanceX * distanceX + distanceZ * distanceZ <
        safeRadius * safeRadius
      ) {
        return false;
      }
    }
  }

  return true;
}

/* =========================================
   SAFE MOVEMENT WITH WALL SLIDING
========================================= */

function moveEntityWithCollision(entity, dx, dz, radius = PLAYER_RADIUS) {
  const startX = entity.position.x;
  const startZ = entity.position.z;

  const distance = Math.hypot(dx, dz);
  const substeps = Math.max(1, Math.ceil(distance / 0.10));
  const stepX = dx / substeps;
  const stepZ = dz / substeps;

  for (let i = 0; i < substeps; i++) {
    const nextX = entity.position.x + stepX;
    const nextZ = entity.position.z + stepZ;

    // Prefer direct movement if the full circular footprint is clear.
    if (canOccupyPosition(nextX, nextZ, radius)) {
      entity.position.x = nextX;
      entity.position.z = nextZ;
      continue;
    }

    // Otherwise slide along the wall using separate axis checks.
    const canMoveX = canOccupyPosition(
      nextX,
      entity.position.z,
      radius
    );

    const canMoveZ = canOccupyPosition(
      entity.position.x,
      nextZ,
      radius
    );

    if (canMoveX) entity.position.x = nextX;
    if (canMoveZ) entity.position.z = nextZ;
  }

  return Math.hypot(
    entity.position.x - startX,
    entity.position.z - startZ
  );
}

/* =========================================
   PLAYER
========================================= */

function setPlayerStart() {
  const position = gridToWorld(1, 1);

  player.x = position.x;
  player.z = position.z;
  player.yaw = 0;
  player.pitch = 0;
  player.stamina = 100;

  updateCamera();
}

function updateCamera() {
  if (!camera) return;

  camera.position.set(player.x, PLAYER_HEIGHT, player.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function movePlayer(dx, dz) {
  const playerBody = {
    position: { x: player.x, z: player.z }
  };

  moveEntityWithCollision(
    playerBody,
    dx,
    dz,
    PLAYER_RADIUS
  );

  player.x = playerBody.position.x;
  player.z = playerBody.position.z;
}

/* =========================================
   MONSTER MODEL AND ANIMATIONS
========================================= */

function createMonster() {
  monster = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.1, 4, 8),
    new THREE.MeshStandardMaterial({
      color: 0x171317,
      roughness: 1
    })
  );

  body.position.y = 1.25;
  monster.add(body);

  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000
  });

  for (const x of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 8, 8),
      eyeMaterial
    );

    eye.position.set(x, 1.75, -0.48);
    monster.add(eye);
  }

  let spawnX = player.x;
  let spawnZ = player.z;
  let foundSpawn = false;

  const spawnCandidates = [
    { x: player.x + CELL * 2, z: player.z },
    { x: player.x - CELL * 2, z: player.z },
    { x: player.x, z: player.z + CELL * 2 },
    { x: player.x, z: player.z - CELL * 2 }
  ];

  for (const candidate of spawnCandidates) {
    if (canOccupyPosition(candidate.x, candidate.z, MONSTER_RADIUS)) {
      spawnX = candidate.x;
      spawnZ = candidate.z;
      foundSpawn = true;
      break;
    }
  }

  if (!foundSpawn) {
    const openCells = [];

    for (let z = 1; z < GRID_SIZE - 1; z++) {
      for (let x = 1; x < GRID_SIZE - 1; x++) {
        if (maze[z][x] === 0) {
          const position = gridToWorld(x, z);

          if (
            Math.hypot(position.x - player.x, position.z - player.z) > CELL * 2 &&
            canOccupyPosition(position.x, position.z, MONSTER_RADIUS)
          ) {
            openCells.push(position);
          }
        }
      }
    }

    if (openCells.length > 0) {
      const position = openCells[
        Math.floor(Math.random() * openCells.length)
      ];

      spawnX = position.x;
      spawnZ = position.z;
    }
  }

  monster.position.set(spawnX, 0, spawnZ);
  scene.add(monster);

  gltfLoader.load(
    "./assets/models/Lonely_Wanderer.glb",
    gltf => {
      if (!monster) return;

      console.log(
        "Monster animations:",
        gltf.animations.map(clip => clip.name)
      );

      monsterModel = gltf.scene;
      monsterModel.scale.setScalar(1);
      monsterModel.position.set(0, 0, 0);

      while (monster.children.length > 0) {
        monster.remove(monster.children[0]);
      }

      monster.add(monsterModel);

      monsterMixer = new THREE.AnimationMixer(monsterModel);
      monsterAnimations = {};

      for (const clip of gltf.animations) {
        monsterAnimations[clip.name] = clip;
      }

      playMonsterAnimation(monsterClips.idle);

      if (!currentMonsterAnimation && gltf.animations.length > 0) {
        currentMonsterAnimation = monsterMixer.clipAction(
          gltf.animations[0]
        );

        currentMonsterAnimation.reset();
        currentMonsterAnimation.play();
      }

      console.log("Monster model and animations ready.");
    },
    undefined,
    error => {
      console.error(
        "Could not load Lonely_Wanderer.glb. Using placeholder.",
        error
      );
    }
  );
}

function playMonsterAnimation(name, options = {}) {
  if (!monsterMixer || !monsterAnimations[name]) return;

  if (
    currentMonsterAnimation &&
    currentMonsterAnimation.getClip().name === name &&
    currentMonsterAnimation.isRunning()
  ) {
    return;
  }

  const nextAction = monsterMixer.clipAction(
    monsterAnimations[name]
  );

  nextAction.reset();
  nextAction.enabled = true;
  nextAction.setEffectiveWeight(1);
  nextAction.setEffectiveTimeScale(1);

  if (options.once) {
    nextAction.setLoop(THREE.LoopOnce, 1);
    nextAction.clampWhenFinished = true;
  } else {
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
  }

  if (currentMonsterAnimation) {
    nextAction.crossFadeFrom(currentMonsterAnimation, 0.2, true);
  }

  nextAction.play();
  currentMonsterAnimation = nextAction;
}

/* =========================================
   A* PATHFINDING
========================================= */

function findMonsterPath(startX, startZ, goalX, goalZ) {
  const key = (x, z) => `${x},${z}`;

  if (
    isGridBlocked(startX, startZ) ||
    isGridBlocked(goalX, goalZ)
  ) {
    return [];
  }

  const startKey = key(startX, startZ);
  const goalKey = key(goalX, goalZ);

  const open = [{
    x: startX,
    z: startZ,
    g: 0,
    f: Math.abs(goalX - startX) + Math.abs(goalZ - startZ)
  }];

  const cameFrom = new Map();
  const costs = new Map([[startKey, 0]]);
  const closed = new Set();

  const directions = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 }
  ];

  while (open.length > 0) {
    open.sort((a, b) => b.f - a.f);

    const current = open.pop();
    const currentKey = key(current.x, current.z);

    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (currentKey === goalKey) {
      const path = [];
      let stepKey = currentKey;

      while (stepKey) {
        const [x, z] = stepKey.split(",").map(Number);
        path.push(gridToWorld(x, z));
        stepKey = cameFrom.get(stepKey);
      }

      return path.reverse();
    }

    for (const direction of directions) {
      const nx = current.x + direction.x;
      const nz = current.z + direction.z;

      if (isGridBlocked(nx, nz)) continue;

      const nextKey = key(nx, nz);
      if (closed.has(nextKey)) continue;

      const newCost = current.g + 1;
      const oldCost = costs.get(nextKey);

      if (oldCost !== undefined && newCost >= oldCost) continue;

      costs.set(nextKey, newCost);
      cameFrom.set(nextKey, currentKey);

      const heuristic = Math.abs(goalX - nx) + Math.abs(goalZ - nz);

      open.push({
        x: nx,
        z: nz,
        g: newCost,
        f: newCost + heuristic
      });
    }
  }

  return [];
}

/* =========================================
   MONSTER AI CONFIGURATION
========================================= */

const MONSTER_STATE = {
  PATROL: "PATROL",
  INVESTIGATE: "INVESTIGATE",
  CHASE: "CHASE",
  SEARCH: "SEARCH",
  RETURN: "RETURN"
};

const MONSTER_AI = {
  patrolSpeed: 1.8,
  investigateSpeed: 2.4,
  chaseSpeed: 4.0,
  searchSpeed: 2.0,

  sightDistance: 16,
  sightAngle: Math.PI * 0.42,

  hearingDistance: 11,
  sprintHearingDistance: 21,

  loseSightTime: 3.5,
  searchDuration: 8,
  investigationDuration: 7,

  catchDistance: 1.35,

  turnSpeed: 3.5,

  minPatrolWait: 1.5,
  maxPatrolWait: 3.5,
  minPatrolDistance: 8,

  stuckTimeout: 1.5,
  progressThreshold: 0.015,

  chaseRepathInterval: 0.25,
  waypointDistance: 0.5,

  // Distance from the player's position at which the monster
  // begins steering directly toward them when a direct route is clear.
  directChaseDistance: 7
};

/* =========================================
   DESTINATION HELPERS
========================================= */

function findNearestOpenCell(worldX, worldZ, maxRadius = 6) {
  const grid = worldToGrid(worldX, worldZ);

  if (
    grid.x < 0 ||
    grid.z < 0 ||
    grid.x >= GRID_SIZE ||
    grid.z >= GRID_SIZE
  ) {
    return null;
  }

  if (!isGridBlocked(grid.x, grid.z)) {
    return { x: grid.x, z: grid.z };
  }

  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) {
          continue;
        }

        const gx = grid.x + dx;
        const gz = grid.z + dz;

        if (!isGridBlocked(gx, gz)) {
          return { x: gx, z: gz };
        }
      }
    }
  }

  return null;
}

function setMonsterDestination(worldX, worldZ) {
  if (!monster) return false;

  const data = monster.userData;

  const start = worldToGrid(
    monster.position.x,
    monster.position.z
  );

  const goal = findNearestOpenCell(worldX, worldZ);

  if (!goal) {
    data.path = [];
    data.pathIndex = 0;
    return false;
  }

  let startX = start.x;
  let startZ = start.z;

  if (isGridBlocked(startX, startZ)) {
    const correctedStart = findNearestOpenCell(
      monster.position.x,
      monster.position.z
    );

    if (!correctedStart) return false;

    startX = correctedStart.x;
    startZ = correctedStart.z;
  }

  const path = findMonsterPath(
    startX,
    startZ,
    goal.x,
    goal.z
  );

  if (path.length > 0) {
    data.path = path;
    data.pathIndex = path.length > 1 ? 1 : 0;
    data.pathGoalX = goal.x;
    data.pathGoalZ = goal.z;
    data.repathTimer = MONSTER_AI.chaseRepathInterval;

    return true;
  }

  data.path = [];
  data.pathIndex = 0;
  return false;
}

function chooseRandomPatrolTarget() {
  if (!monster) return;

  const data = monster.userData;
  const start = worldToGrid(
    monster.position.x,
    monster.position.z
  );

  for (let attempt = 0; attempt < 40; attempt++) {
    const gx = 1 + Math.floor(Math.random() * (GRID_SIZE - 2));
    const gz = 1 + Math.floor(Math.random() * (GRID_SIZE - 2));

    if (isGridBlocked(gx, gz)) continue;

    const gridDistance =
      Math.abs(gx - start.x) + Math.abs(gz - start.z);

    if (gridDistance < 3) continue;

    const path = findMonsterPath(start.x, start.z, gx, gz);

    if (path.length < 2) continue;

    data.path = path;
    data.pathIndex = 1;

    const target = path[path.length - 1];

    data.patrolTargetX = target.x;
    data.patrolTargetZ = target.z;

    data.patrolTurnTimer =
      MONSTER_AI.minPatrolWait +
      Math.random() *
      (MONSTER_AI.maxPatrolWait - MONSTER_AI.minPatrolWait);

    data.repathTimer = 0.5;
    return;
  }

  data.path = [];
  data.pathIndex = 0;
  data.patrolTurnTimer = 1;
}

/* =========================================
   AI INITIALIZATION AND STATE CHANGES
========================================= */

function initializeMonsterAI() {
  if (!monster) return;

  const data = monster.userData;

  data.aiInitialized = true;
  data.state = MONSTER_STATE.PATROL;

  data.path = [];
  data.pathIndex = 0;
  data.repathTimer = 0;
  data.stateTimer = 0;
  data.lostSightTimer = 0;

  data.lastKnownPlayer = null;
  data.investigationTarget = null;

  data.lastX = monster.position.x;
  data.lastZ = monster.position.z;
  data.stuckTimer = 0;
  data.patrolTurnTimer = 0;

  data.homeX = monster.position.x;
  data.homeZ = monster.position.z;

  chooseRandomPatrolTarget();

  console.log("Monster AI initialized.");
}

function setMonsterState(newState) {
  if (!monster) return;

  const data = monster.userData;
  if (data.state === newState) return;

  console.log("Monster state:", data.state, "->", newState);

  data.state = newState;
  data.stateTimer = 0;
  data.repathTimer = 0;

  if (newState === MONSTER_STATE.PATROL) {
    data.lastKnownPlayer = null;
    data.investigationTarget = null;
    chooseRandomPatrolTarget();
  }

  if (newState === MONSTER_STATE.CHASE) {
    data.lostSightTimer = 0;
    data.lastKnownPlayer = { x: player.x, z: player.z };
  }

  if (newState === MONSTER_STATE.SEARCH) {
    data.path = [];
    data.pathIndex = 0;
  }

  if (newState === MONSTER_STATE.RETURN) {
    setMonsterDestination(data.homeX, data.homeZ);
  }
}

/* =========================================
   SMOOTH TURNING
========================================= */

function smoothMonsterTurn(targetX, targetZ, delta) {
  const dx = targetX - monster.position.x;
  const dz = targetZ - monster.position.z;

  if (Math.hypot(dx, dz) < 0.001) return;

  const targetRotation = Math.atan2(dx, dz);

  let difference = targetRotation - monster.rotation.y;

  difference = Math.atan2(
    Math.sin(difference),
    Math.cos(difference)
  );

  const turnAmount = Math.min(
    Math.abs(difference),
    MONSTER_AI.turnSpeed * delta
  );

  monster.rotation.y += Math.sign(difference) * turnAmount;
}

/* =========================================
   LINE OF SIGHT
========================================= */

function canMonsterSeePlayer() {
  if (!monster) return false;

  const dx = player.x - monster.position.x;
  const dz = player.z - monster.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance > MONSTER_AI.sightDistance) return false;
  if (distance < 2.5) return true;

  const facingX = Math.sin(monster.rotation.y);
  const facingZ = Math.cos(monster.rotation.y);

  const directionX = dx / distance;
  const directionZ = dz / distance;

  const dot = facingX * directionX + facingZ * directionZ;

  if (dot < Math.cos(MONSTER_AI.sightAngle)) return false;

  const start = new THREE.Vector3(
    monster.position.x,
    1.6,
    monster.position.z
  );

  const end = new THREE.Vector3(
    player.x,
    PLAYER_HEIGHT,
    player.z
  );

  const direction = end.clone().sub(start);
  const rayDistance = direction.length();

  direction.normalize();

  const raycaster = new THREE.Raycaster(
    start,
    direction,
    0,
    rayDistance
  );

  return raycaster.intersectObjects(walls, false).length === 0;
}

/* =========================================
   SOUND DETECTION
========================================= */

function notifyMonsterOfNoise(x, z, intensity = 1) {
  if (!monster || !monster.userData.aiInitialized) return;

  const data = monster.userData;

  if (data.state === MONSTER_STATE.CHASE) return;

  const distance = Math.hypot(
    x - monster.position.x,
    z - monster.position.z
  );

  const hearingRange = intensity > 1
    ? MONSTER_AI.sprintHearingDistance
    : MONSTER_AI.hearingDistance;

  if (distance > hearingRange) return;

  data.investigationTarget = { x, z };

  setMonsterState(MONSTER_STATE.INVESTIGATE);
  setMonsterDestination(x, z);
}

/* =========================================
   STUCK RECOVERY
========================================= */

function recoverMonsterIfStuck() {
  const data = monster.userData;

  data.stuckTimer = 0;
  data.lastX = monster.position.x;
  data.lastZ = monster.position.z;

  if (data.state === MONSTER_STATE.CHASE) {
    setMonsterDestination(player.x, player.z);
    data.repathTimer = 0.15;
    return;
  }

  if (
    data.state === MONSTER_STATE.INVESTIGATE &&
    data.investigationTarget
  ) {
    setMonsterDestination(
      data.investigationTarget.x,
      data.investigationTarget.z
    );
    return;
  }

  if (data.state === MONSTER_STATE.RETURN) {
    setMonsterDestination(data.homeX, data.homeZ);
    return;
  }

  data.path = [];
  data.pathIndex = 0;
  chooseRandomPatrolTarget();
}

/* =========================================
   MONSTER MOVEMENT
========================================= */

function getMonsterSpeed(state) {
  switch (state) {
    case MONSTER_STATE.CHASE:
      return MONSTER_AI.chaseSpeed;

    case MONSTER_STATE.INVESTIGATE:
      return MONSTER_AI.investigateSpeed;

    case MONSTER_STATE.SEARCH:
      return MONSTER_AI.searchSpeed;

    default:
      return MONSTER_AI.patrolSpeed;
  }
}

// True when the straight path from the monster to the player is clear.
function hasClearPathToPlayer() {
  const dx = player.x - monster.position.x;
  const dz = player.z - monster.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance < 0.001) return true;

  // Check several points along the path using the monster's footprint.
  const samples = Math.max(2, Math.ceil(distance / 0.2));

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const x = monster.position.x + dx * t;
    const z = monster.position.z + dz * t;

    if (!canOccupyPosition(x, z, MONSTER_RADIUS)) {
      return false;
    }
  }

  return true;
}

// Direct pursuit avoids making the monster aim for the exact center
// of the player's grid cell when they are already in the same corridor.
function moveMonsterDirectlyTowardPlayer(delta) {
  const dx = player.x - monster.position.x;
  const dz = player.z - monster.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance < 0.001) return false;

  const step = Math.min(
    getMonsterSpeed(MONSTER_STATE.CHASE) * delta,
    distance
  );

  smoothMonsterTurn(player.x, player.z, delta);

  const moved = moveEntityWithCollision(
    monster,
    (dx / distance) * step,
    (dz / distance) * step,
    MONSTER_RADIUS
  );

  return moved > 0.0005;
}

function followMonsterPath(delta) {
  const data = monster.userData;

  // If the player is close and a straight route is clear, abandon the
  // center-line waypoint and pursue the player's actual world position.
  if (
    data.state === MONSTER_STATE.CHASE &&
    hasClearPathToPlayer()
  ) {
    return moveMonsterDirectlyTowardPlayer(delta);
  }

  while (data.path && data.pathIndex < data.path.length) {
    const waypoint = data.path[data.pathIndex];

    const distance = Math.hypot(
      waypoint.x - monster.position.x,
      waypoint.z - monster.position.z
    );

    if (distance > MONSTER_AI.waypointDistance) break;

    data.pathIndex++;
  }

  const waypoint = data.path && data.path[data.pathIndex];

  if (!waypoint) return false;

  const dx = waypoint.x - monster.position.x;
  const dz = waypoint.z - monster.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance < 0.001) return false;

  const speed = getMonsterSpeed(data.state);
  const step = Math.min(speed * delta, distance);

  const moveX = (dx / distance) * step;
  const moveZ = (dz / distance) * step;

  smoothMonsterTurn(waypoint.x, waypoint.z, delta);

  const moved = moveEntityWithCollision(
    monster,
    moveX,
    moveZ,
    MONSTER_RADIUS
  );

  if (moved < 0.001) {
    data.stuckTimer += delta;
  }

  return moved > 0.0005;
}

/* =========================================
   MAIN MONSTER AI
========================================= */

function updateMonster(delta) {
  if (!monster || !started || gameOver || won) return;

  const data = monster.userData;

  if (!data.aiInitialized) {
    initializeMonsterAI();
  }

  data.stateTimer += delta;
  data.repathTimer -= delta;

  const progress = Math.hypot(
    monster.position.x - data.lastX,
    monster.position.z - data.lastZ
  );

  if (progress > MONSTER_AI.progressThreshold) {
    data.stuckTimer = 0;
    data.lastX = monster.position.x;
    data.lastZ = monster.position.z;
  } else {
    data.stuckTimer += delta;
  }

  if (data.stuckTimer >= MONSTER_AI.stuckTimeout) {
    recoverMonsterIfStuck();
  }

  const seesPlayer = canMonsterSeePlayer();

  if (seesPlayer) {
    data.lastKnownPlayer = { x: player.x, z: player.z };
    data.lostSightTimer = 0;

    if (data.state !== MONSTER_STATE.CHASE) {
      setMonsterState(MONSTER_STATE.CHASE);
    }
  } else if (data.state === MONSTER_STATE.CHASE) {
    data.lostSightTimer += delta;

    if (data.repathTimer <= 0 && data.lastKnownPlayer) {
      setMonsterDestination(
        data.lastKnownPlayer.x,
        data.lastKnownPlayer.z
      );

      data.repathTimer = 0.4;
    }

    if (data.lostSightTimer >= MONSTER_AI.loseSightTime) {
      setMonsterState(MONSTER_STATE.SEARCH);
    }
  }

  switch (data.state) {
    case MONSTER_STATE.PATROL: {
      data.patrolTurnTimer -= delta;

      if (
        data.patrolTurnTimer <= 0 ||
        !data.path ||
        data.pathIndex >= data.path.length
      ) {
        chooseRandomPatrolTarget();
      }

      break;
    }

    case MONSTER_STATE.INVESTIGATE: {
      if (data.investigationTarget) {
        if (
          data.repathTimer <= 0 &&
          (!data.path || data.pathIndex >= data.path.length)
        ) {
          setMonsterDestination(
            data.investigationTarget.x,
            data.investigationTarget.z
          );
        }

        const noiseDistance = Math.hypot(
          monster.position.x - data.investigationTarget.x,
          monster.position.z - data.investigationTarget.z
        );

        if (noiseDistance < 1.5) {
          setMonsterState(MONSTER_STATE.SEARCH);
          break;
        }
      }

      if (data.stateTimer >= MONSTER_AI.investigationDuration) {
        setMonsterState(MONSTER_STATE.RETURN);
      }

      break;
    }

    case MONSTER_STATE.CHASE: {
      if (data.repathTimer <= 0) {
        const playerGrid = worldToGrid(player.x, player.z);

        const currentGoal =
          data.pathGoalX === playerGrid.x &&
          data.pathGoalZ === playerGrid.z;

        if (
          !currentGoal ||
          !data.path ||
          data.pathIndex >= data.path.length
        ) {
          setMonsterDestination(player.x, player.z);
        }

        data.lastKnownPlayer = { x: player.x, z: player.z };
        data.repathTimer = MONSTER_AI.chaseRepathInterval;
      }

      break;
    }

    case MONSTER_STATE.SEARCH: {
      if (data.stateTimer >= MONSTER_AI.searchDuration) {
        setMonsterState(MONSTER_STATE.RETURN);
        break;
      }

      if (
        data.repathTimer <= 0 &&
        (!data.path || data.pathIndex >= data.path.length)
      ) {
        const center = data.lastKnownPlayer || {
          x: monster.position.x,
          z: monster.position.z
        };

        const angle = Math.random() * Math.PI * 2;
        const radius = 2 + Math.random() * 5;

        setMonsterDestination(
          center.x + Math.cos(angle) * radius,
          center.z + Math.sin(angle) * radius
        );

        data.repathTimer = 1.5;
      }

      break;
    }

    case MONSTER_STATE.RETURN: {
      const homeDistance = Math.hypot(
        data.homeX - monster.position.x,
        data.homeZ - monster.position.z
      );

      if (homeDistance < 1.5) {
        setMonsterState(MONSTER_STATE.PATROL);
        break;
      }

      if (
        data.repathTimer <= 0 &&
        (!data.path || data.pathIndex >= data.path.length)
      ) {
        setMonsterDestination(data.homeX, data.homeZ);
        data.repathTimer = 0.8;
      }

      break;
    }
  }

  const moving = followMonsterPath(delta);

  if (monsterMixer) {
    if (data.state === MONSTER_STATE.CHASE && moving) {
      playMonsterAnimation(monsterClips.run);
    } else if (moving) {
      playMonsterAnimation(monsterClips.walk);
    } else {
      playMonsterAnimation(monsterClips.idle);
    }
  }

  monsterDistance = Math.hypot(
    player.x - monster.position.x,
    player.z - monster.position.z
  );

  if (monsterDistance < MONSTER_AI.catchDistance) {
    endGame(false);
  }

  if (monsterWarning) {
    if (data.state === MONSTER_STATE.CHASE) {
      monsterWarning.textContent = "IT FOUND YOU. RUN!";
    } else if (data.state === MONSTER_STATE.INVESTIGATE) {
      monsterWarning.textContent = "SOMETHING HEARD YOU...";
    } else if (monsterDistance < 12) {
      monsterWarning.textContent = "IT IS NEARBY";
    } else {
      monsterWarning.textContent = "";
    }
  }
}

/* =========================================
   FOOTSTEP AUDIO
========================================= */

function playFootstep() {
  if (!audioContext) return;

  if (audioContext.state !== "running") {
    audioContext.resume().catch(() => {});
    return;
  }

  const now = audioContext.currentTime;
  const duration = 0.11;

  const sampleCount = Math.max(
    1,
    Math.floor(audioContext.sampleRate * duration)
  );

  const buffer = audioContext.createBuffer(
    1,
    sampleCount,
    audioContext.sampleRate
  );

  const noiseData = buffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
  }

  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const noiseGain = audioContext.createGain();

  noise.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(700, now);

  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.10, now + 0.008);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(audioContext.destination);

  noise.start(now);
  noise.stop(now + duration);

  const oscillator = audioContext.createOscillator();
  const thumpGain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(95, now);
  oscillator.frequency.exponentialRampToValueAtTime(42, now + duration);

  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(thumpGain);
  thumpGain.connect(audioContext.destination);

  oscillator.start(now);
  oscillator.stop(now + duration);
}

/* =========================================
   START GAME
========================================= */

function startGame() {
  if (started) return;

  started = true;
  gameOver = false;
  won = false;
  elapsed = 0;
  nextFootstepTime = 0;

  player.stamina = 100;

  for (const key of Object.keys(keys)) {
    keys[key] = false;
  }

  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  } else if (!audioContext) {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass) {
        audioContext = new AudioContextClass();
        audioContext.resume().catch(() => {});
      }
    } catch (error) {
      console.warn("Audio initialization failed:", error);
    }
  }

  if (monster) {
    monster.userData.aiInitialized = false;
  }

  startScreen.classList.add("hidden");

  if (errorScreen) errorScreen.classList.add("hidden");
  if (hud) hud.classList.remove("hidden");

  showMessage("Find the exit. Keep moving.");

  if (renderer?.domElement.requestPointerLock) {
    renderer.domElement.requestPointerLock();
  }
}

/* =========================================
   MOUSE AND KEYBOARD
========================================= */

function onPointerLockChange() {
  pointerLocked =
    !!renderer &&
    document.pointerLockElement === renderer.domElement;
}

function onMouseMove(event) {
  if (!started || !pointerLocked || gameOver || won) return;

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

  if ([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowDown", "ArrowLeft",
    "ArrowRight", "Space"
  ].includes(event.code)) {
    event.preventDefault();
  }

  if (
    event.code === "Escape" &&
    started &&
    !gameOver &&
    !won
  ) {
    showMessage("Click the game to resume looking around.");
  }

  if (event.code === "KeyR" && (gameOver || won)) {
    window.location.reload();
  }
}

function onKeyUp(event) {
  keys[event.code] = false;
}

/* =========================================
   PLAYER MOVEMENT
========================================= */

function updatePlayer(delta) {
  if (!started || gameOver || won) return;

  const forwardInput =
    keys.KeyW || keys.ArrowUp
      ? 1
      : keys.KeyS || keys.ArrowDown
        ? -1
        : 0;

  const sidewaysInput =
    keys.KeyD || keys.ArrowRight
      ? 1
      : keys.KeyA || keys.ArrowLeft
        ? -1
        : 0;

  const moving = forwardInput !== 0 || sidewaysInput !== 0;
  const sprinting = keys.ShiftLeft || keys.ShiftRight;

  let speed = player.speed;

  if (sprinting && moving && player.stamina > 0) {
    speed = player.sprintSpeed;
    player.stamina = Math.max(0, player.stamina - 25 * delta);
  } else {
    player.stamina = Math.min(100, player.stamina + 12 * delta);
  }

  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);

  let moveX =
    (-sin * forwardInput + cos * sidewaysInput) * speed * delta;

  let moveZ =
    (-cos * forwardInput - sin * sidewaysInput) * speed * delta;

  const inputLength = Math.hypot(forwardInput, sidewaysInput);

  if (inputLength > 1) {
    moveX *= Math.SQRT1_2;
    moveZ *= Math.SQRT1_2;
  }

  const previousX = player.x;
  const previousZ = player.z;

  movePlayer(moveX, moveZ);
  updateCamera();

  const distanceMoved = Math.hypot(
    player.x - previousX,
    player.z - previousZ
  );

  if (moving && distanceMoved > 0.0005) {
    const stepInterval = speed === player.sprintSpeed ? 0.30 : 0.45;
    const now = performance.now() / 1000;

    if (now >= nextFootstepTime) {
      playFootstep();

      notifyMonsterOfNoise(
        player.x,
        player.z,
        speed === player.sprintSpeed ? 1.9 : 1.0
      );

      nextFootstepTime = now + stepInterval;
    }
  } else {
    nextFootstepTime = 0;
  }

  if (statusText && !gameOver && !won) {
    statusText.textContent = `STAMINA: ${Math.round(player.stamina)}%`;
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
  if (!messageText) return;

  messageText.textContent = text;
  messageTimer = 3;
}

function endGame(success) {
  if (gameOver || won) return;

  if (success) {
    won = true;
    showMessage("YOU ESCAPED... FOR NOW.");

    if (statusText) statusText.textContent = "EXIT FOUND";
  } else {
    gameOver = true;
    showMessage("IT FOUND YOU.");

    if (statusText) statusText.textContent = "YOU WERE CAUGHT";
  }

  if (monsterWarning) monsterWarning.textContent = "";

  setTimeout(() => {
    if (startScreen) startScreen.classList.remove("hidden");

    if (startButton) {
      startButton.textContent = success ? "PLAY AGAIN" : "TRY AGAIN";
    }

    if (hud) hud.classList.add("hidden");

    document.exitPointerLock?.();
    started = false;
  }, 1800);
}

function showError(error) {
  console.error("Backrooms initialization error:", error);

  if (errorMessage) {
    errorMessage.textContent =
      "The game could not initialize. Check the browser console for the error.";
  }

  if (errorScreen) {
    errorScreen.classList.remove("hidden");
  } else {
    alert("The Backrooms game could not initialize. Check the browser console.");
  }
}

/* =========================================
   RESIZE AND MAIN LOOP
========================================= */

function onResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (!renderer || !scene || !camera || !clock) return;

  const delta = Math.min(clock.getDelta(), 0.05);

  if (monsterMixer) {
    monsterMixer.update(delta);
  }

  if (started && !gameOver && !won) {
    elapsed += delta;

    updatePlayer(delta);
    updateMonster(delta);

    if (messageTimer > 0) {
      messageTimer -= delta;

      if (messageTimer <= 0 && messageText) {
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
