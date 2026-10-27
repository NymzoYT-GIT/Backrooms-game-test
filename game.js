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
let previousMonsterAnimation = null;

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
      throw new Error(
        'Missing HTML element with id="game-container".'
      );
    }

    if (!startScreen || !startButton) {
      throw new Error(
        'Missing start screen or start button. Check index.html.'
      );
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
    error => {
      console.warn("Could not load texture:", path, error);
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

    stack.push({ x: nx, z: nz });
  }

  // Create an open area around the exit.
  for (let z = GRID_SIZE - 5; z < GRID_SIZE - 1; z++) {
    for (let x = GRID_SIZE - 5; x < GRID_SIZE - 1; x++) {
      maze[z][x] = 0;
    }
  }

  // Connect the maze to the exit area.
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

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldWidth),
    floorMaterial
  );

  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
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

function isBlocked(x, z) {
  const grid = worldToGrid(x, z);

  if (
    grid.x < 0 ||
    grid.z < 0 ||
    grid.x >= GRID_SIZE ||
    grid.z >= GRID_SIZE
  ) {
    return true;
  }

  return maze[grid.z][grid.x] !== 0;
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

  camera.position.set(
    player.x,
    PLAYER_HEIGHT,
    player.z
  );

  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
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
   MONSTER MODEL AND ANIMATIONS
========================================= */

function createMonster() {
  monster = new THREE.Group();

  // Temporary placeholder if the model fails to load.
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

  // Find an open spawn cell near the player.
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
    if (!isBlocked(candidate.x, candidate.z)) {
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
          openCells.push(gridToWorld(x, z));
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

      console.log("Monster GLB loaded successfully.");

      console.log(
        "Available animations:",
        gltf.animations.map(clip => clip.name)
      );

      monsterModel = gltf.scene;
      monsterModel.scale.setScalar(1);
      monsterModel.position.set(0, 0, 0);

      // Remove the placeholder without changing the custom model.
      while (monster.children.length > 0) {
        monster.remove(monster.children[0]);
      }

      monster.add(monsterModel);

      // Set up the animation mixer.
      monsterMixer = new THREE.AnimationMixer(monsterModel);
      monsterAnimations = {};

      for (const clip of gltf.animations) {
        monsterAnimations[clip.name] = clip;
      }

      // Start with idle.
      playMonsterAnimation(monsterClips.idle);

      if (!currentMonsterAnimation && gltf.animations.length > 0) {
        currentMonsterAnimation = monsterMixer.clipAction(
          gltf.animations[0]
        );

        currentMonsterAnimation.reset();
        currentMonsterAnimation.play();
      }

      console.log("Monster animation setup complete.");
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
  if (!monsterMixer || !monsterAnimations[name]) {
    return;
  }

  const clip = monsterAnimations[name];

  if (
    currentMonsterAnimation &&
    currentMonsterAnimation.getClip().name === name &&
    currentMonsterAnimation.isRunning()
  ) {
    return;
  }

  previousMonsterAnimation = currentMonsterAnimation;

  const nextAction = monsterMixer.clipAction(clip);

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

  if (previousMonsterAnimation) {
    nextAction.crossFadeFrom(previousMonsterAnimation, 0.2, true);
  }

  nextAction.play();
  currentMonsterAnimation = nextAction;
}

/* =========================================
   MONSTER PATHFINDING
========================================= */

function findMonsterPath(startX, startZ, goalX, goalZ) {
  const key = (x, z) => `${x},${z}`;

  if (
    startX < 0 ||
    startZ < 0 ||
    goalX < 0 ||
    goalZ < 0 ||
    startX >= GRID_SIZE ||
    startZ >= GRID_SIZE ||
    goalX >= GRID_SIZE ||
    goalZ >= GRID_SIZE
  ) {
    return [];
  }

  if (maze[startZ][startX] !== 0) return [];
  if (maze[goalZ][goalX] !== 0) return [];

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

      if (
        nx < 0 ||
        nz < 0 ||
        nx >= GRID_SIZE ||
        nz >= GRID_SIZE ||
        maze[nz][nx] !== 0
      ) {
        continue;
      }

      const nextKey = key(nx, nz);

      if (closed.has(nextKey)) continue;

      const newCost = current.g + 1;
      const oldCost = costs.get(nextKey);

      if (oldCost !== undefined && newCost >= oldCost) {
        continue;
      }

      costs.set(nextKey, newCost);
      cameFrom.set(nextKey, currentKey);

      const heuristic =
        Math.abs(goalX - nx) +
        Math.abs(goalZ - nz);

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

function chooseMonsterDestination() {
  if (!monster || maze.length === 0) return;

  const data = monster.userData;
  const start = worldToGrid(
    monster.position.x,
    monster.position.z
  );

  for (let attempt = 0; attempt < 50; attempt++) {
    const goalX = 1 + Math.floor(
      Math.random() * (GRID_SIZE - 2)
    );

    const goalZ = 1 + Math.floor(
      Math.random() * (GRID_SIZE - 2)
    );

    if (maze[goalZ][goalX] !== 0) continue;

    const distanceFromStart =
      Math.abs(goalX - start.x) +
      Math.abs(goalZ - start.z);

    if (distanceFromStart < 4) continue;

    const path = findMonsterPath(
      start.x,
      start.z,
      goalX,
      goalZ
    );

    if (path.length > 1) {
      data.path = path;
      data.pathIndex = 1;
      data.repathTimer = 4 + Math.random() * 4;
      return;
    }
  }

  data.path = [];
  data.pathIndex = 0;
  data.repathTimer = 1;
}

/* =========================================
   MONSTER BEHAVIOR AI
========================================= */

const MONSTER_STATE = {
  PATROL: "PATROL",
  INVESTIGATE: "INVESTIGATE",
  CHASE: "CHASE",
  SEARCH: "SEARCH",
  RETURN: "RETURN"
};

const MONSTER_AI = {
  patrolSpeed: 1.6,
  investigateSpeed: 2.2,
  chaseSpeed: 3.8,
  searchSpeed: 1.9,

  sightDistance: 13,
  sightAngle: Math.PI * 0.32,

  hearingDistance: 10,
  sprintHearingDistance: 19,

  loseSightTime: 3.5,
  searchDuration: 8,
  investigationDuration: 6,

  catchDistance: 1.3
};

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

  data.lastPlayerX = player.x;
  data.lastPlayerZ = player.z;

  data.lastX = monster.position.x;
  data.lastZ = monster.position.z;

  data.stuckTimer = 0;

  chooseMonsterDestination();

  console.log("Monster AI initialized:", data.state);
}

function setMonsterState(newState) {
  if (!monster) return;

  const data = monster.userData;

  if (data.state === newState) return;

  console.log(
    "Monster behavior:",
    data.state,
    "->",
    newState
  );

  data.state = newState;
  data.stateTimer = 0;
  data.repathTimer = 0;

  if (newState === MONSTER_STATE.PATROL) {
    data.lastKnownPlayer = null;
    data.investigationTarget = null;
    chooseMonsterDestination();
  }

  if (newState === MONSTER_STATE.SEARCH) {
    data.path = [];
    data.pathIndex = 0;
  }
}

function canMonsterSeePlayer() {
  if (!monster || !camera) return false;

  const dx = player.x - monster.position.x;
  const dz = player.z - monster.position.z;

  const distance = Math.hypot(dx, dz);

  if (distance > MONSTER_AI.sightDistance) {
    return false;
  }

  // A nearby player can be seen without precise facing.
  if (distance < 2.5) {
    return true;
  }

  // Check whether the player is in front of the monster.
  const facingX = Math.sin(monster.rotation.y);
  const facingZ = Math.cos(monster.rotation.y);

  const directionX = dx / distance;
  const directionZ = dz / distance;

  const dot =
    facingX * directionX +
    facingZ * directionZ;

  if (dot < Math.cos(MONSTER_AI.sightAngle)) {
    return false;
  }

  // Raycast against walls to prevent seeing through them.
  const start = monster.position.clone();
  start.y = 1.6;

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

  const hits = raycaster.intersectObjects(walls, false);

  return hits.length === 0;
}

function notifyMonsterOfNoise(x, z, intensity = 1) {
  if (!monster || !monster.userData.aiInitialized) {
    return;
  }

  const data = monster.userData;

  const distance = Math.hypot(
    x - monster.position.x,
    z - monster.position.z
  );

  const hearingRange =
    MONSTER_AI.hearingDistance * intensity;

  if (distance > hearingRange) {
    return;
  }

  // The monster does not stop chasing because of a noise.
  if (data.state === MONSTER_STATE.CHASE) {
    return;
  }

  data.investigationTarget = {
    x,
    z
  };

  data.stateTimer = 0;

  setMonsterState(MONSTER_STATE.INVESTIGATE);
  setMonsterDestination(x, z);
}

function setMonsterDestination(x, z) {
  if (!monster) return;

  const data = monster.userData;

  const start = worldToGrid(
    monster.position.x,
    monster.position.z
  );

  const goal = worldToGrid(x, z);

  if (
    goal.x < 0 ||
    goal.z < 0 ||
    goal.x >= GRID_SIZE ||
    goal.z >= GRID_SIZE
  ) {
    return;
  }

  // If the requested destination is a wall,
  // find a nearby open cell.
  if (maze[goal.z][goal.x] !== 0) {
    let found = false;

    for (let radius = 1; radius <= 4 && !found; radius++) {
      for (let dz = -radius; dz <= radius && !found; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const gx = goal.x + dx;
          const gz = goal.z + dz;

          if (
            gx >= 0 &&
            gz >= 0 &&
            gx < GRID_SIZE &&
            gz < GRID_SIZE &&
            maze[gz][gx] === 0
          ) {
            goal.x = gx;
            goal.z = gz;
            found = true;
            break;
          }
        }
      }
    }

    if (!found) return;
  }

  const path = findMonsterPath(
    start.x,
    start.z,
    goal.x,
    goal.z
  );

  if (path.length > 0) {
    data.path = path;
    data.pathIndex = path.length > 1 ? 1 : 0;
  } else {
    data.path = [];
    data.pathIndex = 0;
  }
}

function updateMonster(delta) {
  if (!monster || !started || gameOver || won) {
    return;
  }

  const data = monster.userData;

  if (!data.aiInitialized) {
    initializeMonsterAI();
  }

  data.stateTimer += delta;
  data.repathTimer -= delta;

  // Detect whether the monster has stopped moving.
  const progress = Math.hypot(
    monster.position.x - data.lastX,
    monster.position.z - data.lastZ
  );

  if (progress > 0.02) {
    data.stuckTimer = 0;
    data.lastX = monster.position.x;
    data.lastZ = monster.position.z;
  } else {
    data.stuckTimer += delta;
  }

  if (data.stuckTimer > 3) {
    data.stuckTimer = 0;
    data.repathTimer = 0;

    if (
      data.state === MONSTER_STATE.CHASE ||
      data.state === MONSTER_STATE.INVESTIGATE
    ) {
      setMonsterDestination(
        data.lastKnownPlayer?.x ?? player.x,
        data.lastKnownPlayer?.z ?? player.z
      );
    } else {
      chooseMonsterDestination();
    }
  }

  const seesPlayer = canMonsterSeePlayer();

  // Remember the player's last visible position.
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

  // Choose behavior based on the current state.
  switch (data.state) {
    case MONSTER_STATE.PATROL: {
      if (
        data.pathIndex >= data.path.length &&
        data.repathTimer <= 0
      ) {
        chooseMonsterDestination();
      }

      break;
    }

    case MONSTER_STATE.INVESTIGATE: {
      if (data.investigationTarget) {
        if (
          data.pathIndex >= data.path.length &&
          data.repathTimer <= 0
        ) {
          setMonsterDestination(
            data.investigationTarget.x,
            data.investigationTarget.z
          );
        }

        if (
          Math.hypot(
            monster.position.x - data.investigationTarget.x,
            monster.position.z - data.investigationTarget.z
          ) < 1.5
        ) {
          setMonsterState(MONSTER_STATE.SEARCH);
        }
      }

      if (
        data.stateTimer >
        MONSTER_AI.investigationDuration
      ) {
        setMonsterState(MONSTER_STATE.RETURN);
      }

      break;
    }

    case MONSTER_STATE.CHASE: {
      // Update the route toward the latest known position.
      if (data.repathTimer <= 0) {
        setMonsterDestination(player.x, player.z);
        data.repathTimer = 0.6;
      }

      break;
    }

    case MONSTER_STATE.SEARCH: {
      if (data.stateTimer >= MONSTER_AI.searchDuration) {
        setMonsterState(MONSTER_STATE.RETURN);
        break;
      }

      // Search around the last known position.
      if (
        data.pathIndex >= data.path.length &&
        data.repathTimer <= 0
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
      if (
        data.pathIndex >= data.path.length &&
        data.repathTimer <= 0
      ) {
        setMonsterState(MONSTER_STATE.PATROL);
      }

      break;
    }
  }

  // Move the monster along its calculated path.
  const target = data.path[data.pathIndex];

  let moving = false;

  if (target) {
    const dx = target.x - monster.position.x;
    const dz = target.z - monster.position.z;

    const distance = Math.hypot(dx, dz);

    if (distance < 0.3) {
      data.pathIndex++;
    } else {
      moving = true;

      let speed = MONSTER_AI.patrolSpeed;

      if (data.state === MONSTER_STATE.INVESTIGATE) {
        speed = MONSTER_AI.investigateSpeed;
      } else if (data.state === MONSTER_STATE.CHASE) {
        speed = MONSTER_AI.chaseSpeed;
      } else if (data.state === MONSTER_STATE.SEARCH) {
        speed = MONSTER_AI.searchSpeed;
      } else if (data.state === MONSTER_STATE.RETURN) {
        speed = MONSTER_AI.patrolSpeed;
      }

      const step = Math.min(speed * delta, distance);

      const dirX = dx / distance;
      const dirZ = dz / distance;

      const nextX = monster.position.x + dirX * step;
      const nextZ = monster.position.z + dirZ * step;

      if (!isBlocked(nextX, monster.position.z)) {
        monster.position.x = nextX;
      }

      if (!isBlocked(monster.position.x, nextZ)) {
        monster.position.z = nextZ;
      }

      // Turn toward the direction of travel.
      monster.rotation.y = Math.atan2(dirX, dirZ);
    }
  }

  // Select animation to match the behavior.
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
    noiseData[i] =
      (Math.random() * 2 - 1) *
      (1 - i / sampleCount);
  }

  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const noiseGain = audioContext.createGain();

  noise.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(700, now);

  noiseGain.gain.setValueAtTime(0.0001, now);
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

  const oscillator = audioContext.createOscillator();
  const thumpGain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(95, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    42,
    now + duration
  );

  thumpGain.gain.setValueAtTime(0.0001, now);
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
   START / RESET GAME
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
        window.AudioContext ||
        window.webkitAudioContext;

      if (AudioContextClass) {
        audioContext = new AudioContextClass();
        audioContext.resume().catch(() => {});
      }
    } catch (error) {
      console.warn("Audio initialization failed:", error);
    }
  }

  startScreen.classList.add("hidden");

  if (errorScreen) {
    errorScreen.classList.add("hidden");
  }

  if (hud) {
    hud.classList.remove("hidden");
  }

  if (startButton) {
    startButton.textContent = "ENTER THE BACKROOMS";
  }

  showMessage("Find the exit. Keep moving.");

  if (renderer && renderer.domElement.requestPointerLock) {
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
  if (!started || !pointerLocked || gameOver || won) {
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
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
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
    showMessage("Click the game to resume looking around.");
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

  const moving =
    forwardInput !== 0 ||
    sidewaysInput !== 0;

  const sprinting =
    keys.ShiftLeft ||
    keys.ShiftRight;

  let speed = player.speed;

  if (sprinting && moving && player.stamina > 0) {
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

  let moveX =
    (-sin * forwardInput + cos * sidewaysInput) *
    speed *
    delta;

  let moveZ =
    (-cos * forwardInput - sin * sidewaysInput) *
    speed *
    delta;

  // Prevent diagonal movement from being faster.
  const inputLength = Math.hypot(
    forwardInput,
    sidewaysInput
  );

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
    const stepInterval =
      speed === player.sprintSpeed
        ? 0.30
        : 0.45;

    const now = performance.now() / 1000;

   if (now >= nextFootstepTime) {
  playFootstep();

  const noiseIntensity =
    speed === player.sprintSpeed ? 1.9 : 1.0;

  notifyMonsterOfNoise(
    player.x,
    player.z,
    noiseIntensity
  );

  nextFootstepTime = now + stepInterval;
}
  } else {
    nextFootstepTime = 0;
  }

  // Update HUD status if the existing element is available.
  if (statusText && !gameOver && !won) {
    statusText.textContent =
      `STAMINA: ${Math.round(player.stamina)}%`;
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

    if (statusText) {
      statusText.textContent = "EXIT FOUND";
    }
  } else {
    gameOver = true;

    showMessage("IT FOUND YOU.");

    if (statusText) {
      statusText.textContent = "YOU WERE CAUGHT";
    }
  }

  if (monsterWarning) {
    monsterWarning.textContent = "";
  }

  setTimeout(() => {
    if (startScreen) {
      startScreen.classList.remove("hidden");
    }

    if (startButton) {
      startButton.textContent = success
        ? "PLAY AGAIN"
        : "TRY AGAIN";
    }

    if (hud) {
      hud.classList.add("hidden");
    }

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
    alert(
      "The Backrooms game could not initialize. Open the browser console for details."
    );
  }
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

  if (!renderer || !scene || !camera || !clock) {
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.05);

  // Animations must update even before gameplay starts.
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
