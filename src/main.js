import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const app = document.querySelector("#app");
app.innerHTML = `
  <div class="viewer-shell">
    <canvas class="viewer"></canvas>
  </div>
`;

const canvas = document.querySelector(".viewer");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4f4f4f);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(3, 2, 5);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(2);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const composer = new EffectComposer(renderer);
composer.setPixelRatio(2);
composer.setSize(window.innerWidth, window.innerHeight);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.28,
  0.18,
  0.95,
);
composer.addPass(bloomPass);

const laserMaterials = [];

const guiState = {
  laserColor: "#ff8080",
  laserGlowColor: "#ff0000",
  laserOpacity: 0.5,
  laserEmissiveIntensity: 4.5,
  bloomStrength: 0.28,
  bloomRadius: 0.18,
  bloomThreshold: 0.95,
  exposure: 0.85,
  background: "#4f4f4f",
  fillColor: "#d7e3f4",
  fillIntensity: 0.45,
  fillX: -6,
  fillY: 7,
  fillZ: -4,
  fillTargetX: 0,
  fillTargetY: 0,
  fillTargetZ: 0,
  keyColor: "#fff6e8",
  keyIntensity: 4,
  keyX: 8,
  keyY: 14,
  keyZ: 10,
  keyTargetX: 0,
  keyTargetY: 0,
  keyTargetZ: 0,
  shadowOpacity: 0.16,
};

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(
  new RoomEnvironment(),
  0.04,
).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = true;
controls.panSpeed = 1.1;
controls.zoomSpeed = 1.2;

const fillLight = new THREE.DirectionalLight(0xd7e3f4, 0.45);
fillLight.position.set(-6, 7, -4);
scene.add(fillLight);
scene.add(fillLight.target);

const directionalLight = new THREE.DirectionalLight(0xfff6e8, 4);
directionalLight.position.set(8, 14, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(3200, 3200);
directionalLight.shadow.bias = -0.00015;
directionalLight.shadow.normalBias = 0.02;
scene.add(directionalLight);
scene.add(directionalLight.target);

const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.16 }),
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = -0.01;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

const loader = new GLTFLoader();
const modelUrl = new URL("../capstone.glb", import.meta.url).href;

const isGlassMaterial = (material) => {
  if (!material) {
    return false;
  }

  const name = material.name?.toLowerCase() ?? "";
  return (
    name.includes("glass") ||
    name.includes("lens") ||
    name.includes("oglaz") ||
    name.includes("flens")
  );
};

const isLaserMaterial = (material) => {
  if (!material) {
    return false;
  }

  return (material.name?.toLowerCase() ?? "").includes("laser");
};

const upgradeGlassMaterial = (material) => {
  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xb7dcff),
    metalness: 0,
    roughness: 0.006,
    transparent: true,
    opacity: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.004,
    reflectivity: 1,
    iridescence: 0.28,
    iridescenceIOR: 1.3,
    envMapIntensity: 3.2,
    specularIntensity: 1.35,
    specularColor: new THREE.Color(0xf4fbff),
    side: material.side ?? THREE.DoubleSide,
  });

  glass.name = material.name;
  return glass;
};

const upgradeLaserMaterial = (material) => {
  const laser = material.clone();
  laser.transparent = true;
  laser.opacity = Math.max(material.opacity ?? 0.3, guiState.laserOpacity);
  laser.depthWrite = false;

  if ("color" in laser && laser.color) {
    laser.color.set(guiState.laserColor);
  }

  if ("emissive" in laser) {
    laser.emissive = new THREE.Color(guiState.laserGlowColor);
    laser.emissiveIntensity = guiState.laserEmissiveIntensity;
  }

  if ("toneMapped" in laser) {
    laser.toneMapped = false;
  }

  return laser;
};

const syncLaserMaterials = () => {
  for (const laser of laserMaterials) {
    if ("color" in laser && laser.color) {
      laser.color.set(guiState.laserColor);
    }

    laser.opacity = guiState.laserOpacity;

    if ("emissive" in laser) {
      laser.emissive.set(guiState.laserGlowColor);
      laser.emissiveIntensity = guiState.laserEmissiveIntensity;
    }
  }
};

const syncLighting = () => {
  renderer.toneMappingExposure = guiState.exposure;
  scene.background.set(guiState.background);
  fillLight.color.set(guiState.fillColor);
  fillLight.intensity = guiState.fillIntensity;
  fillLight.position.set(guiState.fillX, guiState.fillY, guiState.fillZ);
  fillLight.target.position.set(
    guiState.fillTargetX,
    guiState.fillTargetY,
    guiState.fillTargetZ,
  );
  directionalLight.color.set(guiState.keyColor);
  directionalLight.intensity = guiState.keyIntensity;
  directionalLight.position.set(guiState.keyX, guiState.keyY, guiState.keyZ);
  directionalLight.target.position.set(
    guiState.keyTargetX,
    guiState.keyTargetY,
    guiState.keyTargetZ,
  );
  shadowCatcher.material.opacity = guiState.shadowOpacity;
  fillLight.target.updateMatrixWorld();
  directionalLight.target.updateMatrixWorld();
};

const syncBloom = () => {
  bloomPass.strength = guiState.bloomStrength;
  bloomPass.radius = guiState.bloomRadius;
  bloomPass.threshold = guiState.bloomThreshold;
};

const gui = new GUI({ title: "Scene Controls" });

const laserFolder = gui.addFolder("Laser");
laserFolder
  .addColor(guiState, "laserColor")
  .name("Beam Color")
  .onChange(syncLaserMaterials);
laserFolder
  .addColor(guiState, "laserGlowColor")
  .name("Glow Color")
  .onChange(syncLaserMaterials);
laserFolder
  .add(guiState, "laserOpacity", 0.05, 1, 0.01)
  .name("Beam Opacity")
  .onChange(syncLaserMaterials);
laserFolder
  .add(guiState, "laserEmissiveIntensity", 0, 8, 0.1)
  .name("Glow Intensity")
  .onChange(syncLaserMaterials);
laserFolder.open();

const lightFolder = gui.addFolder("Lights");
lightFolder
  .add(guiState, "exposure", 0.2, 1.8, 0.01)
  .name("Exposure")
  .onChange(syncLighting);
lightFolder
  .addColor(guiState, "background")
  .name("Background")
  .onChange(syncLighting);
lightFolder
  .addColor(guiState, "fillColor")
  .name("Fill Color")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillIntensity", 0, 3, 0.01)
  .name("Fill Power")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillX", -40, 40, 0.1)
  .name("Fill X")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillY", -40, 40, 0.1)
  .name("Fill Y")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillZ", -40, 40, 0.1)
  .name("Fill Z")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillTargetX", -40, 40, 0.1)
  .name("Fill Aim X")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillTargetY", -40, 40, 0.1)
  .name("Fill Aim Y")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "fillTargetZ", -40, 40, 0.1)
  .name("Fill Aim Z")
  .onChange(syncLighting);
lightFolder
  .addColor(guiState, "keyColor")
  .name("Key Color")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyIntensity", 0, 6, 0.01)
  .name("Key Power")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyX", -40, 40, 0.1)
  .name("Key X")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyY", -40, 40, 0.1)
  .name("Key Y")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyZ", -40, 40, 0.1)
  .name("Key Z")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyTargetX", -40, 40, 0.1)
  .name("Key Aim X")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyTargetY", -40, 40, 0.1)
  .name("Key Aim Y")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "keyTargetZ", -40, 40, 0.1)
  .name("Key Aim Z")
  .onChange(syncLighting);
lightFolder
  .add(guiState, "shadowOpacity", 0, 0.6, 0.01)
  .name("Shadow Opacity")
  .onChange(syncLighting);

const bloomFolder = gui.addFolder("Bloom");
bloomFolder
  .add(guiState, "bloomStrength", 0, 2, 0.01)
  .name("Strength")
  .onChange(syncBloom);
bloomFolder
  .add(guiState, "bloomRadius", 0, 1, 0.01)
  .name("Radius")
  .onChange(syncBloom);
bloomFolder
  .add(guiState, "bloomThreshold", 0, 2, 0.01)
  .name("Threshold")
  .onChange(syncBloom);

syncLighting();
syncBloom();

const configureShadowCamera = (light, center, radius) => {
  const shadowCamera = light.shadow.camera;
  const shadowExtent = radius * 2.2;

  light.target.position.copy(center);
  shadowCamera.left = -shadowExtent;
  shadowCamera.right = shadowExtent;
  shadowCamera.top = shadowExtent;
  shadowCamera.bottom = -shadowExtent;
  shadowCamera.near = 0.5;
  shadowCamera.far = Math.max(radius * 8, 50);
  shadowCamera.updateProjectionMatrix();
};

loader.load(modelUrl, (gltf) => {
  const model = gltf.scene;
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;

  model.position.sub(center);
  model.position.y += size.y / 2;

  const framedCenter = new THREE.Vector3(0, size.y * 0.42, 0);
  const viewDirection = new THREE.Vector3(1.15, 0.78, 1.25).normalize();
  const fitDistance = Math.max(radius * 1.45, 3.5);

  camera.position.copy(
    framedCenter.clone().add(viewDirection.multiplyScalar(fitDistance)),
  );
  camera.near = Math.max(maxDim / 100, 0.01);
  camera.far = Math.max(maxDim * 20, 100);
  camera.updateProjectionMatrix();

  const shadowCenter = new THREE.Vector3(0, size.y * 0.5, 0);
  directionalLight.position.set(
    radius * 1.8,
    size.y + radius * 2.6,
    radius * 1.6,
  );
  guiState.keyX = directionalLight.position.x;
  guiState.keyY = directionalLight.position.y;
  guiState.keyZ = directionalLight.position.z;
  guiState.keyTargetX = shadowCenter.x;
  guiState.keyTargetY = shadowCenter.y;
  guiState.keyTargetZ = shadowCenter.z;
  configureShadowCamera(directionalLight, shadowCenter, radius);

  shadowCatcher.scale.set(radius * 2.4, radius * 1.8, 1);
  shadowCatcher.position.set(0, -0.01, 0);

  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    child.material = Array.isArray(child.material)
      ? materials.map((material) => {
          if (isLaserMaterial(material)) {
            const laserMaterial = upgradeLaserMaterial(material);
            laserMaterials.push(laserMaterial);
            return laserMaterial;
          }

          return isGlassMaterial(material)
            ? upgradeGlassMaterial(material)
            : material;
        })
      : isLaserMaterial(child.material)
        ? (() => {
            const laserMaterial = upgradeLaserMaterial(child.material);
            laserMaterials.push(laserMaterial);
            return laserMaterial;
          })()
        : isGlassMaterial(child.material)
          ? upgradeGlassMaterial(child.material)
          : child.material;

    const hasGlass = materials.some(isGlassMaterial);
    const hasLaser = materials.some(isLaserMaterial);
    child.castShadow = !hasGlass && !hasLaser;

    if (!hasGlass) {
      for (const material of materials) {
        if ("envMapIntensity" in material) {
          material.envMapIntensity = Math.min(
            material.envMapIntensity ?? 1,
            0.35,
          );
        }
      }
    }

    child.receiveShadow = !hasGlass && !hasLaser;
  });

  controls.target.copy(framedCenter);
  controls.minDistance = Math.max(radius * 0.12, 0.35);
  controls.maxDistance = Math.max(radius * 8, 30);
  controls.update();
  syncLaserMaterials();
  syncLighting();
});

const handleResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
};

window.addEventListener("resize", handleResize);

const tick = () => {
  controls.update();
  composer.render();
  window.requestAnimationFrame(tick);
};

tick();
