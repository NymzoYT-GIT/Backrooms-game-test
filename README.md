# 👁️ The Backrooms

**A 3D browser-based survival horror game.**

Enter an endless maze of yellow walls, dim lighting, and eerie corridors. Explore the Backrooms, avoid the creature hunting you, and find the exit before it catches you.

Built for browser gameplay using HTML, CSS, JavaScript, and Three.js.

---

## 🎮 About the Game

You have entered a strange place with no obvious way out.

Navigate the maze, listen to your instincts, and keep moving. A monster is somewhere inside the Backrooms, and it will chase you.

Your objective is simple:

**Find the exit. Don't get caught.**

### Features

- 🏚️ **3D Environment** — Explore a maze rendered in your browser.
- 👁️ **Monster AI** — A creature pursues the player.
- 🏃 **Sprint Mechanic** — Run faster when you need to escape.
- 🔦 **Atmospheric Lighting** — Experience dim lighting and fog.
- 🧱 **Custom Textures** — Add your own wall, floor, and ceiling textures.
- 👹 **Custom Monster Model** — Load a 3D monster model using GLB format.
- 🚪 **Escape Objective** — Search for the exit to complete the level.
- 🌐 **Browser-Based** — Designed to run on a website without a traditional game installation.

> This project is under development. Features, gameplay, graphics, and level design may change as development continues.

---

## 🕹️ Controls

| Input | Action |
|---|---|
| `W` | Move forward |
| `A` | Move left |
| `S` | Move backward |
| `D` | Move right |
| Mouse | Look around |
| `Shift` | Sprint |
| `Esc` | Release the mouse |
| `R` | Reload after a game-ending screen |

**Tip:** Click inside the game to regain mouse control after releasing it.

---

## 🛠️ Technologies

This project uses:

- **HTML5** — Game page and interface.
- **CSS3** — Styling and menus.
- **JavaScript** — Gameplay, movement, and monster logic.
- **Three.js** — 3D rendering.
- **GLTFLoader** — Loading custom 3D models.
- **GitHub Pages** — Hosting the game online.

Three.js is loaded from a CDN, so an internet connection is required.

---

## 📁 Project Structure

```text
backrooms-game/
│
├── index.html
├── style.css
├── game.js
├── README.md
│
└── assets/
    ├── textures/
    │   ├── wall.jpeg
    │   ├── floor.jpeg
    │   └── roof.jpeg
    │
    └── models/
        └── Lonely_Wanderer.glb
```

### Main Files

| File | Description |
|---|---|
| `index.html` | Main game page and interface |
| `style.css` | Menus, buttons, HUD, and visual styling |
| `game.js` | 3D world, maze generation, player controls, and monster AI |
| `README.md` | Project documentation |

---

## 🎨 Custom Assets

The game supports custom textures and a custom monster model.

### Environment Textures

Place your texture files in `assets/textures/`.

| Filename | Purpose |
|---|---|
| `wall.jpeg` | Wall texture |
| `floor.jpeg` | Floor texture |
| `roof.jpeg` | Ceiling texture |

Keep the filenames and capitalization consistent with the paths in `game.js`.

### Monster Model

Place your monster model here:

```text
assets/models/Lonely_Wanderer.glb
```

The game uses the GLB format through Three.js's `GLTFLoader`.

If the model cannot be loaded, the current code uses a basic placeholder creature instead.

**Asset tip:** Optimize large textures and 3D models for browser performance, particularly on lower-powered devices.

Only use assets you created yourself or have permission to use.

---

## 🌐 Run the Game with GitHub Pages

This project is designed to be hosted as a static website.

1. Upload or commit the project files to your GitHub repository.
2. Open your repository's **Settings**.
3. Select **Pages**.
4. Under the build and deployment settings, choose **Deploy from a branch**.
5. Select your main branch and the root folder (`/`).
6. Save the settings.
7. Wait for GitHub Pages to publish the site.
8. Open the published website.

The game uses JavaScript modules, so test it through the published website or another local web server rather than opening `index.html` directly as a file.

### Asset Paths

The game expects its assets to be available at the paths shown in the project structure. If an image or model fails to load, check the filename, capitalization, and folder location.

---

## 🚧 Planned Improvements

The project is still being developed. Possible future additions include:

- [ ] More Backrooms levels.
- [ ] Improved monster behavior and pathfinding.
- [ ] Custom monster animations.
- [ ] Better collision detection.
- [ ] More detailed environmental textures.
- [ ] Flickering lights and stronger horror atmosphere.
- [ ] Sound effects and ambient audio.
- [ ] Improved stamina and sprint feedback.
- [ ] Main menu and game-over screen improvements.
- [ ] Performance optimizations for Chromebooks.
- [ ] More props and environmental details.
- [ ] Additional escape objectives.

These are planned ideas, not promises that the features are already implemented.

---

## ⚙️ Performance

The game uses browser-based 3D rendering. Performance depends on the device, browser, scene complexity, and graphics hardware.

For smoother gameplay:

- Keep textures at reasonable resolutions.
- Optimize 3D model polygon counts.
- Compress large assets where appropriate.
- Avoid adding too many dynamic lights.
- Test performance on the devices you want to support.

---

## 📜 Credits and Assets

- **Game concept and development:** Project creator.
- **3D rendering:** Three.js.
- **Custom models and textures:** Credited to their respective creators.

Add any additional asset credits, licenses, and third-party acknowledgments here.

---

## 📄 License

No license has been specified for this project yet.

Until you choose a license, others should not assume they have permission to redistribute or reuse your original code and assets.

---

## 👁️ Final Note

You're not supposed to be here.

The lights are buzzing. The halls seem endless. Something is following you.

**Find the exit.**
