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
const WALL_HEIGHT = 6;
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

// Inventory and hotbar state
let inventoryOpen = false;
let selectedHotbarSlot = 0;

const hotbarSlots = document.querySelectorAll(".hotbar-slot");
const inventorySlots = document.querySelectorAll(".inventory-slot");
const inventoryOverlay = document.getElementById("inventory-overlay");
const inventoryCloseButton = document.getElementById("inventory-close");

const adminLevel1Overlay = document.getElementById("admin-level-1-overlay");
const adminLevel1CloseButton = document.getElementById("admin-level-1-close");
const adminToggleButtons = document.querySelectorAll(".admin-toggle");

let adminPanelOpen = false;

const adminLevel2Overlay = document.getElementById("admin-level-2-overlay");
const adminLevel2CloseButton = document.getElementById("admin-level-2-close");
const adminConsoleOutput = document.getElementById("admin-console-output");
const adminConsoleForm = document.getElementById("admin-console-form");
const adminConsoleInput = document.getElementById("admin-console-input");

let adminConsoleOpen = false;
let adminCommandHistory = [];
let adminHistoryIndex = 0;

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
  idle: "Idle_A",
  walk: "Zombie_Walk",
  run: "Run_Stealth"
};

/* =========================================
   INITIALIZATION
========================================= */

function onResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.5)
  );
}

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

// Fog disabled for long-distance visibility.
scene.fog = null;

    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
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
  // Start with every cell blocked.
  maze = Array.from(
    { length: GRID_SIZE },
    () => Array(GRID_SIZE).fill(1)
  );

  // Generate a connected base maze.
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

    // Open the wall between the current and next cells.
    maze[current.z + direction.z / 2][
      current.x + direction.x / 2
    ] = 0;

    maze[nz][nx] = 0;
    stack.push({ x: nx, z: nz });
  }

  // Open some interior walls to create interconnected spaces.
  // Preserve the outer boundary.
  for (let z = 2; z < GRID_SIZE - 2; z++) {
    for (let x = 2; x < GRID_SIZE - 2; x++) {
      if (maze[z][x] === 1 && Math.random() < 0.38) {
        maze[z][x] = 0;
      }
    }
  }

  // Create several larger open rooms.
  const openRooms = [
    { x: 4, z: 4, width: 5, depth: 5 },
    { x: 18, z: 4, width: 6, depth: 5 },
    { x: 5, z: 17, width: 6, depth: 6 },
    { x: 17, z: 17, width: 6, depth: 6 }
  ];

  // Carve out the rooms.
  for (const room of openRooms) {
    for (let z = room.z; z < room.z + room.depth; z++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (
          x > 0 &&
          z > 0 &&
          x < GRID_SIZE - 1 &&
          z < GRID_SIZE - 1
        ) {
          maze[z][x] = 0;
        }
      }
    }
  }

  // Designated doorway locations and orientations.
  // These are open maze cells, not functional doors yet.
  const doorways = [
    { x: 8, z: 4, direction: "x" },
    { x: 20, z: 9, direction: "z" },
    { x: 8, z: 19, direction: "x" },
    { x: 20, z: 20, direction: "z" }
  ];

  // Open the designated doorway cells after carving rooms.
  for (const doorway of doorways) {
    if (
      doorway.x > 0 &&
      doorway.z > 0 &&
      doorway.x < GRID_SIZE - 1 &&
      doorway.z < GRID_SIZE - 1
    ) {
      maze[doorway.z][doorway.x] = 0;
    }
  }

  // Keep the exit area open.
  for (let z = GRID_SIZE - 5; z < GRID_SIZE - 1; z++) {
    for (let x = GRID_SIZE - 5; x < GRID_SIZE - 1; x++) {
      maze[z][x] = 0;
    }
  }

  // Connect the exit area to the rest of the map.
  for (let x = GRID_SIZE - 7; x < GRID_SIZE - 1; x++) {
    maze[GRID_SIZE - 3][x] = 0;
  }

  // Create a few extra openings through remaining walls.
  const doorOpeningCount = 4;
  let openingsCreated = 0;
  let attempts = 0;

  while (openingsCreated < doorOpeningCount && attempts < 300) {
    attempts++;

    const x =
      2 + Math.floor(Math.random() * (GRID_SIZE - 4));

    const z =
      2 + Math.floor(Math.random() * (GRID_SIZE - 4));

    if (maze[z][x] !== 1) continue;

    const horizontalOpening =
      maze[z][x - 1] === 0 &&
      maze[z][x + 1] === 0;

    const verticalOpening =
      maze[z - 1][x] === 0 &&
      maze[z + 1][x] === 0;

    if (!horizontalOpening && !verticalOpening) continue;

    maze[z][x] = 0;
    openingsCreated++;
  }

  // Test opening immediately beside the starting cell.
  maze[1][2] = 0;
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

  // Wall material.
  const wallMaterial = new THREE.MeshStandardMaterial({
    map: wallTexture,
    color: 0xc9bd7d,
    roughness: 0.96
  });

  // Floor material.
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: floorTexture,
    color: 0xb6ad94,
    roughness: 1
  });

  // Ceiling material.
  const roofMaterial = new THREE.MeshStandardMaterial({
    map: roofTexture,
    color: 0xc9c19a,
    roughness: 1,
    side: THREE.DoubleSide
  });

  // Floor.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldWidth),
    floorMaterial
  );

  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  // Ceiling.
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldWidth),
    roofMaterial
  );

  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_HEIGHT;
  scene.add(ceiling);

  // Fluorescent ceiling panels: one per grid cell.
  const lightPanelGeometry = new THREE.PlaneGeometry(
    CELL * 0.65,
    CELL * 0.42
  );

  const lightPanelMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4cf,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  for (let z = 0; z < GRID_SIZE; z++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const lightPanel = new THREE.Mesh(
        lightPanelGeometry,
        lightPanelMaterial
      );

      lightPanel.rotation.x = Math.PI / 2;

      lightPanel.position.set(
        x * CELL - offset + CELL / 2,
        WALL_HEIGHT - 0.035,
        z * CELL - offset + CELL / 2
      );

      scene.add(lightPanel);
    }
  }

  // Wall geometry. Keep it aligned with the collision grid.
// Doorway openings will be handled by the maze grid in the next step.
const wallGeometry = new THREE.BoxGeometry(
  CELL,
  WALL_HEIGHT,
  CELL
);

  // Build walls only in blocked grid cells.
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

  // Exit.
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

  exit.position.set(
    exitPosition.x,
    1.6,
    exitPosition.z
  );

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
  // No Clip: move freely without wall collision.
  if (adminStates.noClip) {
    player.x += dx;
    player.z += dz;
    return;
  }

  // Normal movement with collision enabled.
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

  // Find a suitable spawn position.
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
    if (
      canOccupyPosition(
        candidate.x,
        candidate.z,
        MONSTER_RADIUS
      )
    ) {
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
        if (maze[z][x] !== 0) continue;

        const position = gridToWorld(x, z);

        if (
          Math.hypot(
            position.x - player.x,
            position.z - player.z
          ) > CELL * 2 &&
          canOccupyPosition(
            position.x,
            position.z,
            MONSTER_RADIUS
          )
        ) {
          openCells.push(position);
        }
      }
    }

    if (openCells.length > 0) {
      const position =
        openCells[Math.floor(Math.random() * openCells.length)];

      spawnX = position.x;
      spawnZ = position.z;
    }
  }

  monster.position.set(spawnX, 0, spawnZ);
  scene.add(monster);

  // Load the actual creature model.
  gltfLoader.load(
    "./assets/models/Lonely_Wanderer.glb?v=2",

    gltf => {
      if (!monster) return;

      console.log(
        "Monster animations:",
        gltf.animations.map(clip => clip.name)
      );

      monsterModel = gltf.scene;

      // Measure the model before scaling it.
      monsterModel.updateMatrixWorld(true);

      const originalBounds = new THREE.Box3().setFromObject(
        monsterModel
      );

      const originalSize = new THREE.Vector3();
      originalBounds.getSize(originalSize);

      console.log("Original monster dimensions:", originalSize);

      // Scale the model to a consistent height.
      if (originalSize.y > 0) {
        const targetHeight = 2.7;
        const scale = targetHeight / originalSize.y;

        monsterModel.scale.setScalar(scale);
      }

      monsterModel.updateMatrixWorld(true);

      // Center the model and put its lowest point on the floor.
      const bounds = new THREE.Box3().setFromObject(monsterModel);
      const center = new THREE.Vector3();

      bounds.getCenter(center);

      monsterModel.position.x -= center.x;
      monsterModel.position.z -= center.z;
      monsterModel.position.y -= bounds.min.y;

      // Remove any previous children, including the old placeholder.
      while (monster.children.length > 0) {
        monster.remove(monster.children[0]);
      }

      monster.add(monsterModel);

      // Set up animations.
      monsterMixer = new THREE.AnimationMixer(monsterModel);
      monsterAnimations = {};
      currentMonsterAnimation = null;

      for (const clip of gltf.animations) {
        monsterAnimations[clip.name] = clip;
      }

      // Start with the requested idle animation.
      if (monsterAnimations["Idle_A"]) {
        playMonsterAnimation("Idle_A");
      } else if (gltf.animations.length > 0) {
        playMonsterAnimation(gltf.animations[0].name);
      } else {
        console.warn("The monster model has no animation clips.");
      }

      console.log("Monster model loaded successfully.");
    },

    undefined,

    error => {
      console.error("Could not load Lonely_Wanderer.glb:", error);
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

const MONSTER_AI = {
  patrolSpeed: 2,
  investigateSpeed: 2.4,
  chaseSpeed: 6.7,
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

    data.repathTimer = MONSTER_AI.chaseRepathInterval;
    return;
  }
}

function setMonsterState(state) {
  if (!monster) return;

  const data = monster.userData;

  data.state = state;
  data.stateTimer = 0;
  data.repathTimer = 0;
  data.path = [];
  data.pathIndex = 0;

  if (state === MONSTER_STATE.PATROL) {
    chooseRandomPatrolTarget();
  }

  if (state === MONSTER_STATE.RETURN) {
    setMonsterDestination(data.homeX, data.homeZ);
  }
}

/* =========================================
   MONSTER SIGHT AND HEARING
========================================= */

function canMonsterSeePlayer() {
  if (!monster || !player || !camera) return false;

  const monsterPosition = monster.position;

  // Direction from the monster toward the player.
  const dx = player.x - monsterPosition.x;
  const dz = player.z - monsterPosition.z;
  const distance = Math.hypot(dx, dz);

  if (distance < 0.001) return true;

  // Cast a ray from the monster toward the player's upper body.
  const origin = new THREE.Vector3(
    monsterPosition.x,
    monsterPosition.y + 1.5,
    monsterPosition.z
  );

  const target = new THREE.Vector3(
    player.x,
    PLAYER_HEIGHT * 0.75,
    player.z
  );

  const direction = target.clone().sub(origin);
  const rayDistance = direction.length();

  direction.normalize();

  const raycaster = new THREE.Raycaster(
    origin,
    direction,
    0,
    rayDistance
  );

  // Walls block the monster's vision.
  const hits = raycaster.intersectObjects(walls, false);

  if (hits.length > 0) {
    return false;
  }

  // Determine the monster's facing direction.
  const forward = new THREE.Vector3(0, 0, -1);

  monster.getWorldQuaternion(
    new THREE.Quaternion()
  );

  const worldQuaternion = new THREE.Quaternion();
  monster.getWorldQuaternion(worldQuaternion);
  forward.applyQuaternion(worldQuaternion);

  // Ignore vertical rotation.
  forward.y = 0;

  if (forward.lengthSq() < 0.001) return false;

  forward.normalize();

  const towardPlayer = new THREE.Vector3(dx, 0, dz).normalize();

  // The player must be somewhere in front of the monster.
  return forward.dot(towardPlayer) > 0;
}

/* =========================================
   MONSTER MOVEMENT
========================================= */

function followMonsterPath(delta) {
  if (!monster) return false;

  const data = monster.userData;

  let target = null;
  let speed = MONSTER_AI.patrolSpeed;

  // During a chase, move directly toward the player's
  // current position instead of following a path.
  if (data.state === MONSTER_STATE.CHASE) {
    target = {
      x: player.x,
      z: player.z
    };

    speed = MONSTER_AI.chaseSpeed;
  } else {
    // Other AI states continue using pathfinding.
    if (!data.path || data.path.length === 0) {
      return false;
    }

    if (data.pathIndex >= data.path.length) {
      return false;
    }

    target = data.path[data.pathIndex];

    switch (data.state) {
      case MONSTER_STATE.INVESTIGATE:
        speed = MONSTER_AI.investigateSpeed;
        break;

      case MONSTER_STATE.SEARCH:
        speed = MONSTER_AI.searchSpeed;
        break;

      case MONSTER_STATE.RETURN:
      case MONSTER_STATE.PATROL:
        speed = MONSTER_AI.patrolSpeed;
        break;
    }

    const waypointDistance = Math.hypot(
      target.x - monster.position.x,
      target.z - monster.position.z
    );

    if (waypointDistance < MONSTER_AI.waypointDistance) {
      data.pathIndex++;

      if (data.pathIndex >= data.path.length) {
        data.path = [];
        data.pathIndex = 0;
      }

      return false;
    }
  }

  // Calculate movement toward the target.
  const dx = target.x - monster.position.x;
  const dz = target.z - monster.position.z;
  const distance = Math.hypot(dx, dz);

  if (distance < 0.001) return false;

  const moveX = (dx / distance) * speed * delta;
  const moveZ = (dz / distance) * speed * delta;

  // Preserve existing wall collision and sliding.
  const movement = moveEntityWithCollision(
    monster,
    moveX,
    moveZ,
    MONSTER_RADIUS
  );

  // Turn the monster toward its movement target.
  const targetYaw = Math.atan2(dx, dz);
  let angleDifference = targetYaw - monster.rotation.y;

  while (angleDifference > Math.PI) {
    angleDifference -= Math.PI * 2;
  }

  while (angleDifference < -Math.PI) {
    angleDifference += Math.PI * 2;
  }

  monster.rotation.y +=
    angleDifference *
    Math.min(1, MONSTER_AI.turnSpeed * delta);

  return movement > 0.001;
}

/* =========================================
   MONSTER AI
========================================= */

const MONSTER_STATE = {
  PATROL: "PATROL",
  INVESTIGATE: "INVESTIGATE",
  CHASE: "CHASE",
  SEARCH: "SEARCH",
  RETURN: "RETURN"
};

/* =========================================
   INITIALIZE MONSTER AI
========================================= */

function initializeMonsterAI() {
  if (!monster) return;

  monster.userData = {
    ...monster.userData,

    state: MONSTER_STATE.PATROL,
    stateTimer: 0,

    path: [],
    pathIndex: 0,

    pathGoalX: null,
    pathGoalZ: null,

    repathTimer: 0,
    patrolTargetX: null,
    patrolTargetZ: null,
    patrolTurnTimer: 0,

    lastKnownPlayer: null,
    investigationTarget: null,

    lostSightTimer: 0,

    homeX: monster.position.x,
    homeZ: monster.position.z,

    stuckTimer: 0,

    previousX: monster.position.x,
    previousZ: monster.position.z
  };

  chooseRandomPatrolTarget();
}


/* =========================================
   MONSTER AI UPDATE
========================================= */

function updateMonsterAI(delta) {
  if (!monster || !started || gameOver || won) return;

  const data = monster.userData;

  if (!data.state) {
    initializeMonsterAI();
    return;
  }

  data.stateTimer += delta;
  data.repathTimer -= delta;
  data.patrolTurnTimer -= delta;

  const distanceToPlayer = Math.hypot(
    player.x - monster.position.x,
    player.z - monster.position.z
  );

  monsterDistance = distanceToPlayer;

  // Catch the player.
  if (
    !adminStates.godMode &&
    distanceToPlayer <= MONSTER_AI.catchDistance
  ) {
    endGame(false);
    return;
  }

  // Check whether the player is visible in front.
  const seesPlayer = canMonsterSeePlayer();

  if (seesPlayer) {
    data.lastKnownPlayer = {
      x: player.x,
      z: player.z
    };

    data.lostSightTimer = 0;

    if (data.state !== MONSTER_STATE.CHASE) {
      setMonsterState(MONSTER_STATE.CHASE);
    }
  } else if (data.state === MONSTER_STATE.CHASE) {
    data.lostSightTimer += delta;

    if (data.lostSightTimer >= MONSTER_AI.loseSightTime) {
      setMonsterState(MONSTER_STATE.SEARCH);
    }
  }

  // Investigate sounds when not chasing or searching.
  if (
    data.state !== MONSTER_STATE.CHASE &&
    data.state !== MONSTER_STATE.SEARCH &&
    canMonsterHearPlayer()
  ) {
    data.investigationTarget = {
      x: player.x,
      z: player.z
    };

    setMonsterState(MONSTER_STATE.INVESTIGATE);
  }

  switch (data.state) {
    case MONSTER_STATE.PATROL: {
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
      if (!data.investigationTarget) {
        setMonsterState(MONSTER_STATE.SEARCH);
        break;
      }

      if (data.repathTimer <= 0) {
        setMonsterDestination(
          data.investigationTarget.x,
          data.investigationTarget.z
        );

        data.repathTimer =
          MONSTER_AI.chaseRepathInterval;
      }

      const targetDistance = Math.hypot(
        monster.position.x - data.investigationTarget.x,
        monster.position.z - data.investigationTarget.z
      );

      if (targetDistance < 1.5) {
        setMonsterState(MONSTER_STATE.SEARCH);
      } else if (
        data.stateTimer >=
        MONSTER_AI.investigationDuration
      ) {
        setMonsterState(MONSTER_STATE.RETURN);
      }

      break;
    }

    case MONSTER_STATE.CHASE: {
      // Recalculate routes as the player moves between cells.
      if (data.repathTimer <= 0) {
        const playerGrid = worldToGrid(
          player.x,
          player.z
        );

        const goalChanged =
          data.pathGoalX !== playerGrid.x ||
          data.pathGoalZ !== playerGrid.z;

        const pathUnavailable =
          !data.path ||
          data.pathIndex >= data.path.length;

        if (goalChanged || pathUnavailable) {
          setMonsterDestination(
            player.x,
            player.z
          );
        }

        data.lastKnownPlayer = {
          x: player.x,
          z: player.z
        };

        data.repathTimer =
          MONSTER_AI.chaseRepathInterval;
      }

      break;
    }

    case MONSTER_STATE.SEARCH: {
      if (
        data.stateTimer >=
        MONSTER_AI.searchDuration
      ) {
        setMonsterState(MONSTER_STATE.RETURN);
        break;
      }

      if (
        data.repathTimer <= 0 &&
        (!data.path ||
          data.pathIndex >= data.path.length)
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
        (!data.path ||
          data.pathIndex >= data.path.length)
      ) {
        setMonsterDestination(
          data.homeX,
          data.homeZ
        );

        data.repathTimer = 0.8;
      }

      break;
    }
  }

  // Move using the existing path-following function.
  const moving = followMonsterPath(delta);

  // Update animations.
  if (monsterMixer) {
    if (
      data.state === MONSTER_STATE.CHASE &&
      moving
    ) {
      playMonsterAnimation(monsterClips.run);
    } else if (moving) {
      playMonsterAnimation(monsterClips.walk);
    } else {
      playMonsterAnimation(monsterClips.idle);
    }
  }

  // Detect when movement stops making progress.
  const moved = Math.hypot(
    monster.position.x - data.previousX,
    monster.position.z - data.previousZ
  );

  if (moved < MONSTER_AI.progressThreshold) {
    data.stuckTimer += delta;
  } else {
    data.stuckTimer = 0;
  }

  data.previousX = monster.position.x;
  data.previousZ = monster.position.z;

  // Recover from a blocked or exhausted route.
  if (data.stuckTimer > MONSTER_AI.stuckTimeout) {
    data.path = [];
    data.pathIndex = 0;

    data.pathGoalX = null;
    data.pathGoalZ = null;

    data.repathTimer = 0;
    data.stuckTimer = 0;

    if (data.state === MONSTER_STATE.CHASE) {
      data.lastKnownPlayer = {
        x: player.x,
        z: player.z
      };
    }
  }

  // Warning indicator.
  if (monsterWarning) {
    monsterWarning.style.opacity =
      distanceToPlayer < 12 ? "1" : "0";
  }

  // Status text.
  if (statusText) {
    statusText.textContent =
      data.state === MONSTER_STATE.CHASE
        ? "DANGER — THE CREATURE IS CHASING YOU"
        : data.state === MONSTER_STATE.INVESTIGATE
          ? "Something heard you..."
          : data.state === MONSTER_STATE.SEARCH
            ? "The creature is searching..."
            : "Explore carefully";
  }
}

/* =========================================
   INVENTORY
========================================= */

function toggleInventory() {
  if (!inventoryOverlay) return;

  inventoryOpen = !inventoryOpen;

  // Remove the hidden class so CSS doesn't override the display.
  inventoryOverlay.classList.toggle("hidden", !inventoryOpen);
  inventoryOverlay.style.display = inventoryOpen ? "flex" : "none";

  if (inventoryOpen) {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  } else if (started && renderer?.domElement.requestPointerLock) {
    renderer.domElement.requestPointerLock();
  }
}

function closeInventory() {
  if (!inventoryOverlay) return;

  inventoryOpen = false;
  inventoryOverlay.classList.add("hidden");
  inventoryOverlay.style.display = "none";

  if (started && !gameOver && !won && renderer?.domElement.requestPointerLock) {
    renderer.domElement.requestPointerLock();
  }
}

function toggleAdminLevel1Panel() {
  if (!started || gameOver || won) return;

  if (adminPanelOpen) {
    closeAdminLevel1Panel();
    return;
  }

  // Close the inventory first if it is open.
  if (inventoryOpen) {
    closeInventory();
  }

  adminPanelOpen = true;

  if (adminLevel1Overlay) {
    adminLevel1Overlay.classList.remove("hidden");
    adminLevel1Overlay.style.display = "flex";
  }

  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}

function closeAdminLevel1Panel() {
  if (!adminPanelOpen) return;

  adminPanelOpen = false;

  if (adminLevel1Overlay) {
    adminLevel1Overlay.classList.add("hidden");
    adminLevel1Overlay.style.display = "none";
  }

  if (
    started &&
    !gameOver &&
    !won &&
    renderer?.domElement.requestPointerLock
  ) {
    renderer.domElement.requestPointerLock();
  }
}

function toggleAdminLevel2Console() {
  if (!started || gameOver || won) return;

  if (adminConsoleOpen) {
    closeAdminLevel2Console();
    return;
  }

  // Close other panels first.
  if (inventoryOpen) {
    closeInventory();
  }

  if (adminPanelOpen) {
    closeAdminLevel1Panel();
  }

  adminConsoleOpen = true;

  if (adminLevel2Overlay) {
    adminLevel2Overlay.classList.remove("hidden");
    adminLevel2Overlay.style.display = "flex";
  }

  if (document.pointerLockElement) {
    document.exitPointerLock();
  }

  // Focus the command input.
  if (adminConsoleInput) {
    adminConsoleInput.focus();
  }
}

function closeAdminLevel2Console() {
  if (!adminConsoleOpen) return;

  adminConsoleOpen = false;

  if (adminLevel2Overlay) {
    adminLevel2Overlay.classList.add("hidden");
    adminLevel2Overlay.style.display = "none";
  }

  if (
    started &&
    !gameOver &&
    !won &&
    renderer?.domElement.requestPointerLock
  ) {
    renderer.domElement.requestPointerLock();
  }
}

function selectHotbarSlot(index) {
  if (index < 0 || index >= hotbarSlots.length) return;

  selectedHotbarSlot = index;

  hotbarSlots.forEach((slot, i) => {
    slot.classList.toggle("selected", i === index);
  });
}

function interact() {
  // Reserved for world interactions such as pickups and doors.
}

if (inventoryCloseButton) {
  inventoryCloseButton.addEventListener("click", closeInventory);
}

if (inventoryOverlay) {
  inventoryOverlay.addEventListener("click", event => {
    if (event.target === inventoryOverlay) {
      closeInventory();
    }
  });
}

if (adminLevel1CloseButton) {
  adminLevel1CloseButton.addEventListener(
    "click",
    closeAdminLevel1Panel
  );
}

const adminStates = {
  godMode: false,
  noClip: false,
  unlimitedFlashlight: false
};

adminToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const setting = button.dataset.adminToggle;

    if (!(setting in adminStates)) return;

adminStates[setting] = !adminStates[setting];

console.log("Admin states:", adminStates);

const enabled = adminStates[setting];

     button.textContent = enabled ? "ON" : "OFF";
    button.setAttribute("aria-pressed", String(enabled));
  });
});

if (adminLevel1Overlay) {
  adminLevel1Overlay.addEventListener("click", event => {
    if (event.target === adminLevel1Overlay) {
      closeAdminLevel1Panel();
    }
  });
}

hotbarSlots.forEach((slot, index) => {
  slot.addEventListener("click", () => {
    selectHotbarSlot(index);
  });
});

/* =========================================
   AUDIO
========================================= */

function initializeAudio() {
  if (audioContext) {
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    return;
  }

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return;

  audioContext = new AudioContextClass();
}

function playTone(frequency, duration, volume = 0.04) {
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + duration
  );

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function updateAudio() {
  if (!audioContext || !monster) return;

  if (monsterDistance < 10) {
    const frequency = 60 + (10 - monsterDistance) * 12;
    playTone(frequency, 0.08, 0.012);
  }
}

/* =========================================
   GAME OVER / WIN
========================================= */

function endGame(playerWon) {
  if (gameOver || won) return;

  if (playerWon) {
    won = true;
  } else {
    gameOver = true;
  }

  if (document.pointerLockElement) {
    document.exitPointerLock();
  }

  const title = playerWon ? "YOU ESCAPED" : "YOU WERE CAUGHT";
  const description = playerWon
    ? "You found the exit."
    : "The creature caught up with you.";

  if (errorScreen) {
    errorScreen.style.display = "flex";

    if (errorMessage) {
      errorMessage.textContent = `${title} — ${description}`;
    }
  } else {
    alert(`${title}\n${description}`);
  }
}

/* =========================================
   ERROR HANDLING
========================================= */

function showError(error) {
  console.error("Game initialization error:", error);

  if (errorScreen) {
    errorScreen.style.display = "flex";
  }

  if (errorMessage) {
    errorMessage.textContent =
      error?.message || "An unexpected error occurred.";
  }
}

/* =========================================
   MAIN UPDATE
========================================= */

function updatePlayer(delta) {
  if (!started || gameOver || won || inventoryOpen) return;

  let forward = 0;
  let strafe = 0;

 // W / Up moves forward; S / Down moves backward.
   if (keys.KeyW || keys.w || keys.ArrowUp) forward -= 1;
   if (keys.KeyS || keys.s || keys.ArrowDown) forward += 1;
   if (keys.KeyA || keys.a || keys.ArrowLeft) strafe -= 1;
   if (keys.KeyD || keys.d || keys.ArrowRight) strafe += 1;

  const inputLength = Math.hypot(forward, strafe);

  if (inputLength > 0) {
    forward /= inputLength;
    strafe /= inputLength;
  }

const wantsSprint =
  (keys.ShiftLeft || keys.ShiftRight || keys.Shift) &&
  player.stamina > 0 &&
  forward < 0;
   
  const speed = wantsSprint
    ? player.sprintSpeed
    : player.speed;

if (wantsSprint && player.stamina > 0) {
  player.stamina = Math.max(0, player.stamina - 25 * delta);
} else {
  player.stamina = Math.min(100, player.stamina + 16 * delta);
}

// Update stamina HUD indicator.
const staminaFill = document.getElementById("stamina-fill");
const staminaValue = document.getElementById("stamina-value");

const staminaPercent = Math.max(
  0,
  Math.min(100, player.stamina)
);

if (staminaFill) {
  staminaFill.style.width = `${staminaPercent}%`;

  if (staminaPercent <= 25) {
    staminaFill.style.backgroundColor = "#c94b4b";
  } else if (staminaPercent <= 50) {
    staminaFill.style.backgroundColor = "#c9a34b";
  } else {
    staminaFill.style.backgroundColor = "#b9c986";
  }
}

if (staminaValue) {
  staminaValue.textContent = `${Math.round(staminaPercent)}%`;
}
   
  const sinYaw = Math.sin(player.yaw);
  const cosYaw = Math.cos(player.yaw);

  const dx =
    (strafe * cosYaw + forward * sinYaw) * speed * delta;

  const dz =
    (forward * cosYaw - strafe * sinYaw) * speed * delta;

  if (inputLength > 0) {
    movePlayer(dx, dz);

    if (elapsed >= nextFootstepTime) {
      playTone(80 + Math.random() * 30, 0.04, 0.008);
      nextFootstepTime = elapsed + (wantsSprint ? 0.28 : 0.45);
    }
  }

  updateCamera();

  const exit = scene?.userData?.exit;

  if (exit) {
    const distanceToExit = Math.hypot(
      player.x - exit.position.x,
      player.z - exit.position.z
    );

    if (distanceToExit < 2) {
      endGame(true);
    }
  }

  const staminaBar = document.getElementById("stamina-fill");

  if (staminaBar) {
    staminaBar.style.width = `${player.stamina}%`;
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (!renderer || !scene || !camera || !clock) return;

  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;

  if (started && !gameOver && !won) {
    updatePlayer(delta);
    updateMonsterAI(delta);
    updateAudio();

    if (monsterMixer) {
      monsterMixer.update(delta);
    }
  }

  if (messageTimer > 0) {
    messageTimer -= delta;

    if (messageTimer <= 0 && messageText) {
      messageText.style.display = "none";
    }
  }

  renderer.render(scene, camera);
}

/* =========================================
   INPUT HANDLERS
========================================= */

function onKeyDown(event) {
  keys[event.code] = true;
  keys[event.key] = true;

  if (
    event.code === "Tab" ||
    event.code === "Space" ||
    event.code.startsWith("Arrow")
  ) {
    event.preventDefault();
  }

  // Don't trigger gameplay shortcuts while typing commands.
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  if (event.repeat) return;

  if (event.code === "Escape") {
    if (inventoryOpen) {
      closeInventory();
    } else if (adminPanelOpen) {
      closeAdminLevel1Panel();
    } else if (adminConsoleOpen) {
      closeAdminLevel2Console();
    }
    return;
  }

  if (!started || gameOver || won) return;

  if (event.code === "KeyE") {
    interact();
  }

  if (event.code === "KeyI" || event.code === "Tab") {
    toggleInventory();
  }

  if (event.code === "Slash") {
    event.preventDefault();
    toggleAdminLevel1Panel();
  }

  if (event.code === "Backslash") {
    event.preventDefault();
    toggleAdminLevel2Console();
  }

  if (event.code.startsWith("Digit")) {
    const slot = Number(event.code.slice(5)) - 1;
    selectHotbarSlot(slot);
  }
}

function onKeyUp(event) {
  keys[event.code] = false;
  keys[event.key] = false;
}

function onMouseMove(event) {
  if (!started || !pointerLocked || gameOver || won) return;
  if (inventoryOpen || adminPanelOpen || adminConsoleOpen) return;

  const sensitivity = 0.002;

  player.yaw -= event.movementX * sensitivity;
  player.pitch -= event.movementY * sensitivity;

  player.pitch = THREE.MathUtils.clamp(
    player.pitch,
    -Math.PI / 2.2,
    Math.PI / 2.2
  );

  updateCamera();
}

function onPointerLockChange() {
  pointerLocked =
    document.pointerLockElement === renderer?.domElement;
}

function startGame() {
  if (started || gameOver || won) return;

  started = true;

  if (startScreen) {
    startScreen.style.display = "none";
  }

  if (hud) {
    hud.style.display = "block";
  }

  initializeAudio();

  if (renderer?.domElement.requestPointerLock) {
    renderer.domElement.requestPointerLock();
  }

  if (monster && !monster.userData.state) {
    initializeMonsterAI();
  }
}

/* =========================================
   START THE GAME
========================================= */

initialize();
