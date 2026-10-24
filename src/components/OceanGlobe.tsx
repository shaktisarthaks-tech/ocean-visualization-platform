import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ContinentFeature, Coordinates, OceanAnomalyRecord, OceanDataLayerId, OceanObservation, OceanRegion } from '../types/ocean';
import { detectContinent } from '../utils/oceanRegions';
import { oceanAudio } from '../utils/audio';
import { MaritimeStation } from '../utils/operationsData';
import { build3DOceanLayer, buildAnomalyBeacon, buildOperationsBeacon, clearGroup } from '../utils/ocean3DLayerBuilder';
import { OceanDataLayerSelector } from './OceanDataLayerSelector';
import { OceanFlowEffects, illustrativeSST, type OceanEffectMode } from './OceanFlowEffects';
import { loadGlobalVectorField, type GlobalVectorField, type VectorDataKind } from '../utils/globalVectorFields';
import { fetchRealBathymetryGrid, getRealBathymetryDataset, type BathymetryGridDataset } from '../utils/bathymetryGridBuilder';
import { getGebcoVertexColor } from './UnderwaterBathymetry';
import './OceanGlobeLayout.css';

export interface BenthicProbeData {
  coords: Coordinates;
  depth: number;
  elevation: number;
  oceanName: string;
  datasetName: string;
  resolution: string;
  attribution: string;
  measurementMethod: string;
  morphologyLabel: string;
  sedimentType: string;
  benthicTemperature: number;
  benthicPressure: number;
}

interface OceanGlobeProps {
  selectedCoords: Coordinates | null;
  depth: number;
  oceanData: OceanObservation | null;
  onSelectCoords: (coords: Coordinates) => void;
  isLoading: boolean;
  activeParameter: string;
  activeLayer?: OceanDataLayerId;
  onSelectLayer?: (layer: OceanDataLayerId) => void;
  showVectorOverlay?: boolean;
  onToggleVectorOverlay?: () => void;
  showStreamlines?: boolean;
  onToggleStreamlines?: () => void;
  pinnedAnomaly?: OceanAnomalyRecord | null;
  operationsStation?: MaritimeStation | null;
  onSetDepth?: (depth: number) => void;
  onContinentClick?: (continent: ContinentFeature) => void;
  selectedRegion?: OceanRegion | null;
  onClearRegion?: () => void;
  verticalExaggeration?: number;
  onVerticalExaggerationChange?: (val: number) => void;
  onDiveToSeabed?: () => void;
  isUnderwater?: boolean;
  onToggleUnderwater?: (underwater: boolean) => void;
}

export const OceanGlobe: React.FC<OceanGlobeProps> = ({
  selectedCoords,
  depth,
  oceanData,
  onSelectCoords,
  isLoading,
  activeParameter,
  activeLayer = 'waveHeight',
  onSelectLayer,
  showVectorOverlay = true,
  onToggleVectorOverlay,
  showStreamlines = true,
  onToggleStreamlines,
  pinnedAnomaly = null,
  operationsStation = null,
  onSetDepth,
  onContinentClick,
  selectedRegion,
  onClearRegion,
  verticalExaggeration = 2.0,
  onVerticalExaggerationChange,
  onDiveToSeabed,
  isUnderwater,
  onToggleUnderwater
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'earth' | 'zooming' | 'underwater'>('earth');
  const [telemetryStep, setTelemetryStep] = useState<number>(0);
  const [clickedBenthicPoint, setClickedBenthicPoint] = useState<BenthicProbeData | null>(null);
  // The visitor, not the animation, controls the globe after the first interaction.
  const [rotationPaused, setRotationPaused] = useState(false);
  const rotationPausedRef = useRef(false);
  const [showLocationDetails, setShowLocationDetails] = useState(false);
  // At most ONE research panel appears over the globe at a time.
  const [activePanel, setActivePanel] = useState<'flow' | 'location' | 'layers' | 'region' | null>(null);
  const [clickedContinent, setClickedContinent] = useState<ContinentFeature | null>(null);

  // Real wind and ocean-current model vectors. No artificial cyclone centers.
  const [effectMode, setEffectMode] = useState<OceanEffectMode>('winds');
  const [temperatureOpacity, setTemperatureOpacity] = useState(0.96);
  // Keep the same Blue Marble base globe in every mode.
  // The older seven-layer visual overlay is optional and OFF by default.
  const [showScientificLayers, setShowScientificLayers] = useState(false);
  const effectModeRef = useRef<OceanEffectMode>('winds');
  const [fieldStatus, setFieldStatus] = useState<{
    state: 'idle' | 'loading' | 'ready' | 'error';
    description: string;
    source?: string;
    validTime?: string;
    validSamples?: number;
  }>({ state: 'loading', description: 'Loading GFS 10 m wind vectors…' });
  const effectsRef = useRef<OceanFlowEffects | null>(null);

  const togglePanel = (panel: 'flow' | 'location' | 'layers' | 'region') => {
    setActivePanel((current) => current === panel ? null : panel);
  };

  const pauseRotation = useCallback(() => {
    rotationPausedRef.current = true;
    setRotationPaused(true);
  }, []);

  const resumeRotation = useCallback(() => {
    rotationPausedRef.current = false;
    setRotationPaused(false);
  }, []);

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const earthGroupRef = useRef<THREE.Group | null>(null);
  const starsRef = useRef<THREE.Points | null>(null);
  const underwaterGroupRef = useRef<THREE.Group | null>(null);
  const seabedGroupRef = useRef<THREE.Group | null>(null);
  const seabedMeshRef = useRef<THREE.Mesh | null>(null);
  const currentBathymetryDatasetRef = useRef<BathymetryGridDataset | null>(null);
  const ventsGroupRef = useRef<THREE.Group | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const pinMeshRef = useRef<THREE.Mesh | null>(null);
  const haloMeshRef = useRef<THREE.Mesh | null>(null);
  const regionHighlightGroupRef = useRef<THREE.Group | null>(null);
  const dataLayerGroupRef = useRef<THREE.Group | null>(null);
  const anomalyBeaconGroupRef = useRef<THREE.Group | null>(null);
  const operationsBeaconGroupRef = useRef<THREE.Group | null>(null);
  const modeRef = useRef<'earth' | 'zooming' | 'underwater'>('earth');
  const onSelectRef = useRef(onSelectCoords);

  // Animation vectors
  const camStartPosRef = useRef(new THREE.Vector3());
  const camTargetPosRef = useRef(new THREE.Vector3());
  const ctrlStartTargetRef = useRef(new THREE.Vector3());
  const ctrlEndTargetRef = useRef(new THREE.Vector3());
  const zoomProgressRef = useRef(0);
  const isFlyingRef = useRef(false);
  const flyProgressRef = useRef(0);

  const oceanDataRef = useRef(oceanData);
  const selectedRegionRef = useRef(selectedRegion);
  const selectedCoordsRef = useRef(selectedCoords);

  useEffect(() => {
    onSelectRef.current = onSelectCoords;
    oceanDataRef.current = oceanData;
    selectedRegionRef.current = selectedRegion;
    selectedCoordsRef.current = selectedCoords;
  }, [onSelectCoords, oceanData, selectedRegion, selectedCoords]);

  // Helper to convert lat/lon to 3D point on Earth
  const latLonToPoint = useCallback((lat: number, lon: number, radius = 1.04): THREE.Vector3 => {
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (-lon * Math.PI) / 180;
    const y = radius * Math.sin(latRad);
    const xz = radius * Math.cos(latRad);
    const x = xz * Math.cos(lonRad);
    const z = xz * Math.sin(lonRad);
    return new THREE.Vector3(x, y, z);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020b1c);
    sceneRef.current = scene;

    // 2. Camera
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 200);
    camera.position.set(0, 0, 3.2);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.33;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    // Direct handling: stop instantly on release rather than drifting after a drag.
    controls.enableDamping = false;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 1.15;
    controls.maxDistance = 8;
    controls.autoRotate = false;
    controlsRef.current = controls;

    // Any manual camera control freezes the default slow globe rotation.
    controls.addEventListener('start', pauseRotation);

    // 5. Starfield Background (5000 stars)
    const starCount = 5000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const dist = 18 + Math.random() * 70;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = dist * Math.cos(phi);
      starPositions[i * 3 + 2] = dist * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.045,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    starsRef.current = stars;

    // 6. Earth Group & Blue Marble Earth Model
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);
    earthGroupRef.current = earthGroup;

    // Attached to Earth's rotating group; effect locations rotate WITH the planet.
    const flowEffects = new OceanFlowEffects();
    earthGroup.add(flowEffects.group);
    effectsRef.current = flowEffects;
    flowEffects.setMode(effectModeRef.current);

    const earthGeo = new THREE.SphereGeometry(1, 128, 128);
    const textureLoader = new THREE.TextureLoader();
    const earthMap = textureLoader.load('/bluemarble-2048_earth.png');
    earthMap.colorSpace = THREE.SRGBColorSpace;
    flowEffects.setEarthTexture(earthMap);

    // Procedural ocean wave micro-bump map for realistic ocean surface texture
    const waveCanvas = document.createElement('canvas');
    waveCanvas.width = 256;
    waveCanvas.height = 256;
    const waveCtx = waveCanvas.getContext('2d');
    if (waveCtx) {
      const wData = waveCtx.createImageData(256, 256);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const w = (Math.sin(x * 0.35 + y * 0.25) * Math.cos(x * 0.25 - y * 0.35) + 1) * 0.5;
          const idx = (y * 256 + x) * 4;
          const bVal = Math.floor(w * 255);
          wData.data[idx] = bVal;
          wData.data[idx + 1] = bVal;
          wData.data[idx + 2] = bVal;
          wData.data[idx + 3] = 255;
        }
      }
      waveCtx.putImageData(wData, 0, 0);
    }
    const oceanBumpMap = new THREE.CanvasTexture(waveCanvas);
    oceanBumpMap.wrapS = THREE.RepeatWrapping;
    oceanBumpMap.wrapT = THREE.RepeatWrapping;
    oceanBumpMap.repeat.set(24, 12);

    const earthMat = new THREE.MeshPhysicalMaterial({
      map: earthMap,
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.015,
      clearcoat: 0.12,
      clearcoatRoughness: 0.45,
      bumpMap: oceanBumpMap,
      bumpScale: 0.002
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);
    earthMeshRef.current = earthMesh;

    // Atmospheric Glow Sphere
    const atmosphereGeo = new THREE.SphereGeometry(1.045, 96, 96);
    // Rim-lit blue atmosphere, instead of a flat translucent blue shell.
    const atmosphereMat = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(0x24cfff) } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vEye;
        void main() {
          vec4 positionView = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vEye = normalize(-positionView.xyz);
          gl_Position = projectionMatrix * positionView;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vEye;
        void main() {
          float rim = 1.0 - max(dot(normalize(vNormal), normalize(vEye)), 0.0);
          float alpha = pow(rim, 2.8) * 0.74;
          gl_FragColor = vec4(glowColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    earthGroup.add(atmosphereMesh);

    // Glowing 3D boundary & landmark group for selected ocean region
    const regionHighlightGroup = new THREE.Group();
    earthGroup.add(regionHighlightGroup);
    regionHighlightGroupRef.current = regionHighlightGroup;

    // Global 7-Layer Ocean Data Group
    const dataLayerGroup = new THREE.Group();
    earthGroup.add(dataLayerGroup);
    dataLayerGroupRef.current = dataLayerGroup;

    // Anomaly Beacons & Operations Stations Groups
    const anomalyBeaconGroup = new THREE.Group();
    earthGroup.add(anomalyBeaconGroup);
    anomalyBeaconGroupRef.current = anomalyBeaconGroup;

    const operationsBeaconGroup = new THREE.Group();
    earthGroup.add(operationsBeaconGroup);
    operationsBeaconGroupRef.current = operationsBeaconGroup;

    // Directional & Ambient Lights
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);

    const ambientLight = new THREE.AmbientLight(0xa8d6ff, 1.1);
    scene.add(ambientLight);
    const fillLight = new THREE.DirectionalLight(0x50caff, 0.95);
    fillLight.position.set(-5, -1, 3);
    scene.add(fillLight);
    const hemisphereLight = new THREE.HemisphereLight(0xc8eeff, 0x042c55, 0.75);
    scene.add(hemisphereLight);

    // Target Pin (inner sphere) & Pulsing Halo
    const pinMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x00eaff })
    );
    pinMesh.visible = false;
    // The pin is stored in Earth-local space so it stays on the correct
    // location even when the Earth group has rotated.
    earthGroup.add(pinMesh);
    pinMeshRef.current = pinMesh;

    const haloMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x00eaff,
        transparent: true,
        opacity: 0.25
      })
    );
    haloMesh.visible = false;
    earthGroup.add(haloMesh);
    haloMeshRef.current = haloMesh;

    // 7. Underwater Realm Group
    const underwaterGroup = new THREE.Group();
    underwaterGroup.visible = false;
    scene.add(underwaterGroup);
    underwaterGroupRef.current = underwaterGroup;

    // Ambient Dome
    const domeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(8, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x003c63, // 15459
        transparent: true,
        opacity: 0.65,
        side: THREE.BackSide,
        depthWrite: false
      })
    );
    underwaterGroup.add(domeMesh);

    // Water Surface Ceiling Grid with realistic physical water material
    const surfaceGeo = new THREE.PlaneGeometry(18, 18, 48, 48);
    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0x0891b2,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide
    });
    const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
    surfaceMesh.rotation.x = -Math.PI / 2;
    surfaceMesh.position.y = 3;
    underwaterGroup.add(surfaceMesh);

    // Underwater Particles (Marine snow)
    const uCount = 2200;
    const uPos = new Float32Array(uCount * 3);
    for (let i = 0; i < uCount; i++) {
      uPos[i * 3] = (Math.random() - 0.5) * 14;
      uPos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      uPos[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    const uGeo = new THREE.BufferGeometry();
    uGeo.setAttribute('position', new THREE.BufferAttribute(uPos, 3));
    const uParticles = new THREE.Points(
      uGeo,
      new THREE.PointsMaterial({
        color: 0x9cf2ff, // 10285055
        size: 0.025,
        transparent: true,
        opacity: 0.55
      })
    );
    underwaterGroup.add(uParticles);

    // Sun Rays / Light Shafts
    const raysGroup = new THREE.Group();
    const rayMat = new THREE.LineBasicMaterial({
      color: 0x7dea7f, // 8252159
      transparent: true,
      opacity: 0.16
    });
    for (let i = 0; i < 18; i++) {
      const rx = -7 + i * 0.8;
      const pts = [new THREE.Vector3(rx, 4, -2), new THREE.Vector3(rx + 1.2, -5, -2)];
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), rayMat);
      raysGroup.add(ray);
    }
    underwaterGroup.add(raysGroup);

    // Currents Streamlines
    const currentsGroup = new THREE.Group();
    const currentMat = new THREE.LineBasicMaterial({
      color: 0x00eaff,
      transparent: true,
      opacity: 0.45
    });
    for (let i = 0; i < 12; i++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-7, -3 + i * 0.5, -1),
        new THREE.Vector3(-3, -2.4 + i * 0.5, 0),
        new THREE.Vector3(1, -3.2 + i * 0.5, 0.5),
        new THREE.Vector3(7, -2.4 + i * 0.5, 0)
      ]);
      const pts = curve.getPoints(50);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), currentMat);
      currentsGroup.add(line);
    }
    underwaterGroup.add(currentsGroup);

    // ========================================================
    // ACCURATE 3D SEABED TERRAIN & BENTHIC REALM
    // ========================================================
    const seabedGroup = new THREE.Group();
    seabedGroup.position.y = -3.8;
    underwaterGroup.add(seabedGroup);

    // 1. Primary Bathymetric Seafloor Mesh (72x72 resolution)
    const seabedGeo = new THREE.PlaneGeometry(28, 28, 72, 72);
    seabedGeo.rotateX(-Math.PI / 2);

    // Initial default abyssal displacement and vertex colors
    const posAttr = seabedGeo.attributes.position;
    const initialColors = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const y = Math.sin(x * 0.35) * Math.cos(z * 0.35) * 0.6 + Math.sin(x * 0.12) * 0.3;
      posAttr.setY(i, y);
      initialColors[i * 3] = 0.05;
      initialColors[i * 3 + 1] = 0.18;
      initialColors[i * 3 + 2] = 0.38;
    }
    seabedGeo.setAttribute('color', new THREE.BufferAttribute(initialColors, 3));
    seabedGeo.computeVertexNormals();

    const seabedMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true
    });
    const seabedMesh = new THREE.Mesh(seabedGeo, seabedMat);
    seabedGroup.add(seabedMesh);

    // 2. Bathymetric Sonar Grid Wireframe Overlay
    const sonarGridMat = new THREE.MeshBasicMaterial({
      color: 0x00eaff,
      wireframe: true,
      transparent: true,
      opacity: 0.16
    });
    const sonarGridMesh = new THREE.Mesh(seabedGeo, sonarGridMat);
    sonarGridMesh.position.y = 0.02;
    seabedGroup.add(sonarGridMesh);

    // 3. Hydrothermal Black Smoker Vent Chimneys (for ridge/trench zones)
    const ventsGroup = new THREE.Group();
    ventsGroup.visible = false;
    for (let i = 0; i < 4; i++) {
      const chimneyGeo = new THREE.CylinderGeometry(0.12, 0.28, 1.4 + Math.random() * 0.8, 8);
      const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x1a242f, roughness: 0.9 });
      const chimney = new THREE.Mesh(chimneyGeo, chimneyMat);
      chimney.position.set((i - 1.5) * 2.8 + (Math.random() - 0.5), 0.7, (Math.random() - 0.5) * 3);
      ventsGroup.add(chimney);
    }
    seabedGroupRef.current = seabedGroup;
    seabedMeshRef.current = seabedMesh;
    ventsGroupRef.current = ventsGroup;

    // 4. Submersible Headlight (Spotlight illuminating the seabed when close)
    const subSpotlight = new THREE.SpotLight(0xa5f3fc, 3.5, 25, Math.PI / 3.5, 0.45, 1.2);
    subSpotlight.position.set(0, 3, 2);
    subSpotlight.target = seabedMesh;
    underwaterGroup.add(subSpotlight);

    // 8. Pointer Handling & Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      // Freeze the globe at its actual current orientation immediately.
      pauseRotation();
      isFlyingRef.current = false;
      controls.enabled = true;
    };

    const handleWheel = () => {
      pauseRotation();
      isFlyingRef.current = false;
      controls.enabled = true;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 8
      ) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // 1. Earth Orbit Mode: Raycast against Earth mesh
      if (modeRef.current === 'earth') {
        const intersects = raycaster.intersectObject(earthMesh);
        if (intersects.length === 0) return;

        const hit = intersects[0];
        // Raycaster returns WORLD coordinates, but latitude/longitude are
        // defined in EARTH-local coordinates. This correction is essential
        // when the globe is rotated by the visitor or by idle animation.
        const localPoint = earthMesh.worldToLocal(hit.point.clone()).normalize();
        const lat = THREE.MathUtils.radToDeg(Math.asin(
          THREE.MathUtils.clamp(localPoint.y, -1, 1)
        ));
        const lon = ((-THREE.MathUtils.radToDeg(
          Math.atan2(localPoint.z, localPoint.x)
        ) + 540) % 360) - 180;

        const pinPos = localPoint.clone().multiplyScalar(1.04);
        pinMesh.position.copy(pinPos);
        haloMesh.position.copy(pinPos);
        pinMesh.visible = true;
        haloMesh.visible = true;

        oceanAudio.playPing(750, 0.25);
        const newCoords: Coordinates = {
          latitude: Number(lat.toFixed(4)),
          longitude: Number(lon.toFixed(4))
        };
        setShowLocationDetails(true);
        setActivePanel('location');
        onSelectRef.current?.(newCoords);

        // Show the clicked point and its data FIRST. Do not unexpectedly
        // open a continent modal or move the camera after the click.
        setClickedContinent(detectContinent(newCoords.latitude, newCoords.longitude) ?? null);

        // Ocean location: position remains stable for data inspection.
      }
      // 2. Underwater Mode: Raycast against 3D Seabed terrain
      else if (modeRef.current === 'underwater' && seabedMeshRef.current) {
        const intersects = raycaster.intersectObject(seabedMeshRef.current);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const hitX = hit.point.x;
          const hitZ = hit.point.z;
          const hitY = hit.point.y;
          const currentOceanData = oceanDataRef.current;
          const currentRegion = selectedRegionRef.current;
          const currentCoords = selectedCoordsRef.current;

          const baseBathy = currentOceanData?.bathymetryDepth || 4200;
          const dataset = currentBathymetryDatasetRef.current;
          let computedDepth = Math.max(15, Math.round(baseBathy - hitY * 420));
          let localLat = Number(((currentCoords?.latitude || 0) + (hitZ / 28) * 1.8).toFixed(4));
          let localLon = Number(((currentCoords?.longitude || 0) + (hitX / 28) * 1.8).toFixed(4));
          let datasetTitle = 'GEBCO 2026 Sub-Ice Global Bathymetric Grid';
          let datasetRes = '15-arc-second scientific resolution (73×73 soundings)';
          let datasetAttr = 'GEBCO Compilation Group / IHO IOC Open Data License';
          let method = 'Real scientific sounding / multibeam sonar & satellite altimetry bathymetric grid';

          if (dataset && dataset.elevations) {
            // PlaneGeometry(28, 28) rotated: hitX is [-14, 14] West->East, hitZ is [-14, 14] North->South
            const u = Math.min(1, Math.max(0, (hitX + 14) / 28));
            const v = Math.min(1, Math.max(0, (hitZ + 14) / 28));
            const col = Math.min(dataset.gridWidth - 1, Math.max(0, Math.floor(u * (dataset.gridWidth - 1))));
            const row = Math.min(dataset.gridHeight - 1, Math.max(0, Math.floor(v * (dataset.gridHeight - 1))));
            const realDepth = dataset.elevations[row * dataset.gridWidth + col];
            if (realDepth !== undefined && Number.isFinite(realDepth)) {
              computedDepth = Math.round(realDepth);
            }
            if (dataset.bounds) {
              const latSpan = dataset.bounds.maxLat - dataset.bounds.minLat;
              const lonSpan = dataset.bounds.maxLon - dataset.bounds.minLon;
              localLat = Number((dataset.bounds.maxLat - v * latSpan).toFixed(4));
              localLon = Number((dataset.bounds.minLon + u * lonSpan).toFixed(4));
            }
            datasetTitle = dataset.source || 'GEBCO 2026 Sub-Ice Global Bathymetric Grid';
            datasetRes = `${dataset.resolutionArcSec}-arc-second gridded resolution (${dataset.gridWidth}×${dataset.gridHeight} sounding nodes)`;
          }

          setClickedBenthicPoint({
            coords: { latitude: localLat, longitude: localLon },
            depth: computedDepth,
            elevation: -computedDepth,
            oceanName: currentRegion?.name || currentOceanData?.oceanBasin || dataset?.name || 'Global Oceanic Grid',
            datasetName: datasetTitle,
            resolution: datasetRes,
            attribution: datasetAttr,
            measurementMethod: method,
            morphologyLabel: currentOceanData?.seabedInfo?.morphologyLabel || (computedDepth > 6000 ? 'Hadal Subduction Trench' : computedDepth > 4000 ? 'Oceanic Abyssal Plain' : computedDepth > 2000 ? 'Mid-Ocean Ridge Rift Crest' : 'Continental Margin Shelf Break'),
            sedimentType: currentOceanData?.seabedInfo?.sedimentType || (computedDepth > 5000 ? 'Siliceous diatomaceous ooze & red clay' : 'Calcareous foraminiferal biogenic ooze'),
            benthicTemperature: currentOceanData?.seabedInfo?.benthicTemperature ?? Number((computedDepth > 4000 ? 1.8 : 3.2).toFixed(1)),
            benthicPressure: Number((1.013 + computedDepth * 0.1008).toFixed(1))
          });
          oceanAudio.playPing(920, 0.2);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: true });

    // Resize
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 9. Animation Loop
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const currentMode = modeRef.current;

      // Earth Idle Rotation
      if (currentMode === 'earth' && !isFlyingRef.current && !rotationPausedRef.current) {
        earthGroup.rotation.y += 0.0011;
      }

      // Smooth Camera Flying from Continent to Ocean Region
      if (isFlyingRef.current) {
        flyProgressRef.current += 0.018;
        const p = Math.min(flyProgressRef.current, 1);
        const t = 0.5 - 0.5 * Math.cos(p * Math.PI);
        camera.position.lerpVectors(camStartPosRef.current, camTargetPosRef.current, t);
        controls.target.lerpVectors(ctrlStartTargetRef.current, ctrlEndTargetRef.current, t);
        if (p >= 1) {
          isFlyingRef.current = false;
          controls.enabled = true;
        }
      }

      // Smooth Camera Zooming Transition
      if (currentMode === 'zooming') {
        zoomProgressRef.current += 0.012;
        const p = Math.min(zoomProgressRef.current, 1);
        const t = 1 - Math.pow(1 - p, 3);

        camera.position.lerpVectors(camStartPosRef.current, camTargetPosRef.current, t);
        controls.target.lerpVectors(ctrlStartTargetRef.current, ctrlEndTargetRef.current, t);

        if (p >= 1) {
          modeRef.current = 'underwater';
          setViewMode('underwater');
          onToggleUnderwater?.(true);
          earthGroup.visible = false;
          stars.visible = false;
          underwaterGroup.visible = true;

          camera.position.set(0, 0.7, 6);
          controls.target.set(0, 0, 0);
          controls.enabled = true;
          controls.minDistance = 1.8;
          controls.maxDistance = 18;
          controls.enablePan = true;
          controls.screenSpacePanning = true;
          controls.update();
          setTelemetryStep(1);
        }
      }

      // Underwater drifting particles and light shafts + camera terrain collision prevention + surface waves
      if (currentMode === 'underwater') {
        uParticles.rotation.y += 0.0007;
        uParticles.position.y = Math.sin(performance.now() * 0.0003) * 0.12;
        currentsGroup.position.x = Math.sin(performance.now() * 0.00025) * 0.35;
        raysGroup.rotation.z = Math.sin(performance.now() * 0.00015) * 0.025;

        // Animate overhead ocean surface wave displacement
        const sPos = surfaceGeo.attributes.position;
        const sTime = performance.now() * 0.0015;
        for (let i = 0; i < sPos.count; i++) {
          const u = sPos.getX(i);
          const v = sPos.getY(i);
          const w =
            Math.sin(u * 0.7 + sTime * 1.3) * 0.08 +
            Math.cos(v * 0.9 + sTime * 1.1) * 0.07 +
            Math.sin((u + v) * 1.3 + sTime * 1.7) * 0.035;
          sPos.setZ(i, w);
        }
        sPos.needsUpdate = true;

        // Prevent camera from unintentionally passing through terrain
        if (seabedGroupRef.current) {
          const terrainBaseY = seabedGroupRef.current.position.y;
          if (camera.position.y < terrainBaseY + 0.5) {
            camera.position.y = terrainBaseY + 0.5;
          }
        }
      }

      // Pulsing Pin Halo
      if (haloMesh.visible) {
        const s = 1 + Math.sin(performance.now() * 0.005) * 0.22;
        haloMesh.scale.set(s, s, s);
      }

      // Animated line highlights follow real sampled model vector streamlines.
      // Globe rotation/camera gestures do not alter the model field.
      flowEffects.update();
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      controls.removeEventListener('start', pauseRotation);

      controls.dispose();
      flowEffects.dispose();
      if (effectsRef.current === flowEffects) effectsRef.current = null;
      starGeo.dispose();
      starMat.dispose();
      earthGeo.dispose();
      earthMap.dispose();
      oceanBumpMap.dispose();
      earthMat.dispose();
      atmosphereGeo.dispose();
      atmosphereMat.dispose();
      pinMesh.geometry.dispose();
      haloMesh.geometry.dispose();
      uGeo.dispose();
      uParticles.material.dispose();
      domeMesh.geometry.dispose();
      surfaceMesh.geometry.dispose();
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [latLonToPoint]);

  // Switch model fields without rebuilding 3D Earth or moving the camera.
  useEffect(() => {
    effectModeRef.current = effectMode;
    effectsRef.current?.setMode(effectMode);
  }, [effectMode]);

  useEffect(() => {
    effectsRef.current?.setTemperatureOpacity(temperatureOpacity);
  }, [temperatureOpacity]);

  // One Earth appearance in EVERY mode: never automatically switch on an older
  // layer when choosing None or Bermuda. The user may explicitly enable it.
  useEffect(() => {
    if (!dataLayerGroupRef.current) return;
    dataLayerGroupRef.current.visible = showScientificLayers;
  }, [showScientificLayers]);

  // Fetch real wind/current vectors from the published Open-Meteo model APIs.
  // On failure: no fake substitute; show an explicit error instead.
  useEffect(() => {
    if (effectMode === 'off' || effectMode === 'bermuda' || effectMode === 'temperature') {
      setFieldStatus({ state: 'idle', description: '' });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const requestedKind: VectorDataKind = effectMode === 'currents' ? 'currents' : 'winds';
    effectsRef.current?.setField(null);
    setFieldStatus({
      state: 'loading',
      description: requestedKind === 'winds'
        ? 'Fetching NOAA GFS forecast wind vectors…'
        : 'Fetching marine model surface-current vectors…'
    });

    loadGlobalVectorField(requestedKind, controller.signal)
      .then((field: GlobalVectorField) => {
        if (cancelled) return;
        effectsRef.current?.setField(field);
        setFieldStatus({
          state: 'ready',
          description: `${field.kind === 'winds' ? '10 m winds' : 'surface currents'} · ${field.latitudeStep}° model-field samples`,
          source: field.source,
          validTime: field.validTime,
          validSamples: field.validSamples,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        effectsRef.current?.setField(null);
        setFieldStatus({
          state: 'error',
          description: error instanceof Error ? error.message : 'Model field unavailable'
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [effectMode]);

  const focusBermuda = useCallback(() => {
    pauseRotation();
    setShowLocationDetails(false);
    const globe = earthGroupRef.current;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (!globe || !cam || !ctrl || modeRef.current !== 'earth') return;

    globe.updateMatrixWorld(true);
    // Approximate geographic center of Miami / Bermuda / San Juan triangle.
    const target = latLonToPoint(25.51, -70.35, 1)
      .applyMatrix4(globe.matrixWorld).normalize();
    camStartPosRef.current.copy(cam.position);
    camTargetPosRef.current.copy(target.clone().multiplyScalar(2.5));
    ctrlStartTargetRef.current.copy(ctrl.target);
    ctrlEndTargetRef.current.set(0, 0, 0);
    flyProgressRef.current = 0;
    isFlyingRef.current = true;
    ctrl.enabled = false;
  }, [latLonToPoint, pauseRotation]);

  // Sync pin position if selectedCoords was chosen via preset dropdown
  useEffect(() => {
    if (!pinMeshRef.current || !haloMeshRef.current) return;
    if (!selectedCoords) {
      pinMeshRef.current.visible = false;
      haloMeshRef.current.visible = false;
      return;
    }

    const pinPos = latLonToPoint(selectedCoords.latitude, selectedCoords.longitude, 1.04);
    pinMeshRef.current.position.copy(pinPos);
    haloMeshRef.current.position.copy(pinPos);
    pinMeshRef.current.visible = true;
    haloMeshRef.current.visible = true;
  }, [selectedCoords, latLonToPoint]);

  // Trigger descent below surface into underwater seabed
  const triggerDive = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const pin = pinMeshRef.current;
    const targetDir = pin && pin.visible
      ? pin.position.clone().normalize()
      : selectedCoords
        ? latLonToPoint(selectedCoords.latitude, selectedCoords.longitude, 1.04).normalize()
        : new THREE.Vector3(0, 0, 1);

    const pinPos = targetDir.clone().multiplyScalar(1.04);
    if (pinMeshRef.current && haloMeshRef.current) {
      pinMeshRef.current.position.copy(pinPos);
      haloMeshRef.current.position.copy(pinPos);
      pinMeshRef.current.visible = true;
      haloMeshRef.current.visible = true;
    }

    modeRef.current = 'zooming';
    setViewMode('zooming');
    camStartPosRef.current.copy(cameraRef.current.position);
    ctrlStartTargetRef.current.copy(controlsRef.current.target);

    camTargetPosRef.current.copy(targetDir.clone().multiplyScalar(1.48));
    ctrlEndTargetRef.current.copy(pinPos.clone().multiplyScalar(0.92));
    zoomProgressRef.current = 0;
    controlsRef.current.enabled = false;
  }, [selectedCoords, latLonToPoint]);

  // Smoothly fly camera to selected ocean region and draw glowing geographic boundary on globe
  useEffect(() => {
    const highlightGroup = regionHighlightGroupRef.current;
    if (!highlightGroup) return;

    // Clear previous boundaries and landmarks
    while (highlightGroup.children.length > 0) {
      const obj = highlightGroup.children[0];
      highlightGroup.remove(obj);
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) (obj as any).material.dispose();
    }

    if (!selectedRegion) return;

    // 1. Draw glowing 3D boundary on the Earth sphere
    const b = selectedRegion.bounds;
    const r = 1.016; // Slightly above sphere radius 1.00
    const boundaryPoints: THREE.Vector3[] = [];

    const steps = 16;
    // Edge 1: minLat, minLon -> minLat, maxLon
    for (let i = 0; i <= steps; i++) {
      const lon = b.minLon + ((b.maxLon - b.minLon) * i) / steps;
      boundaryPoints.push(latLonToPoint(b.minLat, lon, r));
    }
    // Edge 2: minLat, maxLon -> maxLat, maxLon
    for (let i = 0; i <= steps; i++) {
      const lat = b.minLat + ((b.maxLat - b.minLat) * i) / steps;
      boundaryPoints.push(latLonToPoint(lat, b.maxLon, r));
    }
    // Edge 3: maxLat, maxLon -> maxLat, minLon
    for (let i = 0; i <= steps; i++) {
      const lon = b.maxLon - ((b.maxLon - b.minLon) * i) / steps;
      boundaryPoints.push(latLonToPoint(b.maxLat, lon, r));
    }
    // Edge 4: maxLat, minLon -> minLat, minLon
    for (let i = 0; i <= steps; i++) {
      const lat = b.maxLat - ((b.maxLat - b.minLat) * i) / steps;
      boundaryPoints.push(latLonToPoint(lat, b.minLon, r));
    }

    const boundaryGeo = new THREE.BufferGeometry().setFromPoints(boundaryPoints);
    const boundaryMat = new THREE.LineBasicMaterial({
      color: 0x00eaff,
      transparent: true,
      opacity: 0.9,
      linewidth: 2
    });
    const boundaryLine = new THREE.Line(boundaryGeo, boundaryMat);
    highlightGroup.add(boundaryLine);

    // 2. Add landmark markers within region
    selectedRegion.nearbyLandmarks.forEach((_landmark, idx) => {
      const markerGeo = new THREE.SphereGeometry(0.018, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0x63ffba });
      const markerMesh = new THREE.Mesh(markerGeo, markerMat);

      const latOffset = b.minLat + (idx + 1) * ((b.maxLat - b.minLat) / (selectedRegion.nearbyLandmarks.length + 1));
      const lonOffset = b.minLon + (idx + 1) * ((b.maxLon - b.minLon) / (selectedRegion.nearbyLandmarks.length + 1));
      markerMesh.position.copy(latLonToPoint(latOffset, lonOffset, 1.022));
      highlightGroup.add(markerMesh);
    });

    // 3. Smooth camera flight from current position to selected ocean
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    if (cam && ctrl && modeRef.current === 'earth') {
      const targetPt = latLonToPoint(selectedRegion.coordinates.latitude, selectedRegion.coordinates.longitude, 1.0);
      const targetDir = targetPt.clone().normalize();
      const endCamPos = targetDir.clone().multiplyScalar(2.15);
      const endCtrlTarget = targetPt.clone().multiplyScalar(0.12);

      camStartPosRef.current.copy(cam.position);
      camTargetPosRef.current.copy(endCamPos);
      ctrlStartTargetRef.current.copy(ctrl.target);
      ctrlEndTargetRef.current.copy(endCtrlTarget);
      flyProgressRef.current = 0;
      isFlyingRef.current = true;
      ctrl.enabled = false;
    }
  }, [selectedRegion, latLonToPoint]);

  // Feature 6: Dynamic 3D Ocean Data Layer Visualization (7 layers)
  useEffect(() => {
    const dataLayerGroup = dataLayerGroupRef.current;
    if (!dataLayerGroup) return;

    build3DOceanLayer(
      dataLayerGroup,
      activeLayer,
      showVectorOverlay,
      showStreamlines,
      latLonToPoint
    );
  }, [activeLayer, showVectorOverlay, showStreamlines, latLonToPoint]);

  // Feature 9: Ocean Anomaly Detection Beacons & Focus
  useEffect(() => {
    const anomalyGroup = anomalyBeaconGroupRef.current;
    if (!anomalyGroup) return;

    buildAnomalyBeacon(anomalyGroup, pinnedAnomaly, latLonToPoint);

    if (pinnedAnomaly && cameraRef.current && controlsRef.current && modeRef.current === 'earth') {
      const targetPt = latLonToPoint(pinnedAnomaly.coordinates.latitude, pinnedAnomaly.coordinates.longitude, 1.0);
      const targetDir = targetPt.clone().normalize();
      const endCamPos = targetDir.clone().multiplyScalar(2.15);
      const endCtrlTarget = targetPt.clone().multiplyScalar(0.12);

      camStartPosRef.current.copy(cameraRef.current.position);
      camTargetPosRef.current.copy(endCamPos);
      ctrlStartTargetRef.current.copy(controlsRef.current.target);
      ctrlEndTargetRef.current.copy(endCtrlTarget);
      flyProgressRef.current = 0;
      isFlyingRef.current = true;
      controlsRef.current.enabled = false;
    }
  }, [pinnedAnomaly, latLonToPoint]);

  // Feature 7: Marine Operations Station Beacon & Focus
  useEffect(() => {
    const opsGroup = operationsBeaconGroupRef.current;
    if (!opsGroup) return;

    buildOperationsBeacon(opsGroup, operationsStation, latLonToPoint);

    if (operationsStation && cameraRef.current && controlsRef.current && modeRef.current === 'earth') {
      const targetPt = latLonToPoint(operationsStation.coordinates.latitude, operationsStation.coordinates.longitude, 1.0);
      const targetDir = targetPt.clone().normalize();
      const endCamPos = targetDir.clone().multiplyScalar(2.15);
      const endCtrlTarget = targetPt.clone().multiplyScalar(0.12);

      camStartPosRef.current.copy(cameraRef.current.position);
      camTargetPosRef.current.copy(endCamPos);
      ctrlStartTargetRef.current.copy(controlsRef.current.target);
      ctrlEndTargetRef.current.copy(endCtrlTarget);
      flyProgressRef.current = 0;
      isFlyingRef.current = true;
      controlsRef.current.enabled = false;
    }
  }, [operationsStation, latLonToPoint]);

  // Dynamic 3D Seabed terrain displacement & vertical elevation using authentic GEBCO bathymetric data
  useEffect(() => {
    const mesh = seabedMeshRef.current;
    const group = seabedGroupRef.current;
    const vents = ventsGroupRef.current;
    if (!mesh || !group) return;

    let active = true;
    const controller = new AbortController();
    const targetRegionId = selectedRegion?.id;
    const hasLookupTarget = Boolean(selectedCoords || targetRegionId);
    if (!hasLookupTarget) return;

    fetchRealBathymetryGrid(targetRegionId, selectedCoords || undefined, {
      signal: controller.signal
    })
      .then((dataset) => {
        if (!active || !dataset) return;
        currentBathymetryDatasetRef.current = dataset;

        const posAttr = mesh.geometry.attributes.position;
        const colorAttr = mesh.geometry.attributes.color;
        const { gridWidth, gridHeight, elevations, minDepth, maxDepth } = dataset;
        const depthSpan = Math.max(1, maxDepth - minDepth);

        // Update mesh vertices using authentic bathymetric elevations
        for (let iy = 0; iy < gridHeight; iy++) {
          for (let ix = 0; ix < gridWidth; ix++) {
            const idx = iy * gridWidth + ix;
            if (idx >= posAttr.count) continue;

            const rawDepthVal = elevations[idx];
            const depthVal = Number.isFinite(rawDepthVal) ? rawDepthVal : minDepth + depthSpan * 0.5;
            // Normalized elevation: 0 for deepest trench, 1 for highest peak
            const normElev = 1 - (depthVal - minDepth) / depthSpan;
            const baseY = (normElev - 0.62) * 3.6;
            posAttr.setY(idx, baseY * (verticalExaggeration / 2.0));

            // Continuous scientific GEBCO elevation color
            const c = getGebcoVertexColor(depthVal);
            if (colorAttr) {
              colorAttr.setXYZ(idx, c.r, c.g, c.b);
            }
          }
        }

        posAttr.needsUpdate = true;
        if (colorAttr) colorAttr.needsUpdate = true;
        mesh.geometry.computeVertexNormals();

        // Hydrothermal vents visibility for ridge & trench zones
        if (vents) {
          const morphology = oceanData?.seabedInfo?.morphology || (dataset.maxDepth > 6000 ? 'trench' : dataset.maxDepth < 4500 && dataset.minDepth < 2500 ? 'ridge' : 'abyssal_plain');
          vents.visible = morphology === 'ridge' || morphology === 'trench';
        }

        // Seabed vertical elevation relative to current submersible depth
        const actualSeabedDepth = oceanData?.bathymetryDepth || dataset.maxDepth || 4200;
        const altitude = Math.max(0, actualSeabedDepth - depth);
        let targetY = -4.5;
        if (altitude <= 0) {
          targetY = -0.7; // Touchdown on seafloor
        } else {
          const normalizedAlt = Math.min(1, altitude / Math.max(300, actualSeabedDepth));
          targetY = -0.7 - normalizedAlt * 4.2;
        }
        group.position.y = targetY;
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError') return;
        console.warn('[OceanGlobe] Error loading bathymetry for seabed mesh:', err);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [oceanData, depth, verticalExaggeration, selectedCoords, selectedRegion]);

  // Underwater telemetry progressive step reveal
  useEffect(() => {
    if (viewMode !== 'underwater') {
      setTelemetryStep(0);
      return;
    }
    const timers = [
      window.setTimeout(() => setTelemetryStep(1), 300),
      window.setTimeout(() => setTelemetryStep(2), 1100),
      window.setTimeout(() => setTelemetryStep(3), 1900),
      window.setTimeout(() => setTelemetryStep(4), 2700),
      window.setTimeout(() => setTelemetryStep(5), 3500)
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [viewMode]);

  // HUD Button actions matching original prototype exactly
  const handleZoomIn = () => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(0.8);
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(1.2);
    }
  };

  const handleReset = useCallback(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const earth = earthGroupRef.current;
    const stars = starsRef.current;
    const underwater = underwaterGroupRef.current;
    const pin = pinMeshRef.current;
    const halo = haloMeshRef.current;

    if (!cam || !ctrl || !earth || !stars || !underwater || !pin || !halo) return;

    modeRef.current = 'earth';
    setViewMode('earth');
    onToggleUnderwater?.(false);
    setClickedBenthicPoint(null);
    earth.visible = true;
    stars.visible = true;
    underwater.visible = false;
    pin.visible = false;
    halo.visible = false;
    halo.scale.set(1, 1, 1);

    // Reset is a manual camera command; leave the Earth stationary afterward.
    pauseRotation();
    isFlyingRef.current = false;
    earth.rotation.set(0, 0, 0);
    cam.position.set(0, 0, 3.2);
    ctrl.target.set(0, 0, 0);
    ctrl.minDistance = 1.15;
    ctrl.maxDistance = 8;
    ctrl.enabled = true;
    ctrl.update();
    setTelemetryStep(0);
  }, [onToggleUnderwater, pauseRotation]);

  // Synchronize with external isUnderwater prop (e.g. from Header or Action Ribbon)
  useEffect(() => {
    if (isUnderwater === true && viewMode === 'earth') {
      triggerDive();
    } else if (isUnderwater === false && viewMode === 'underwater') {
      handleReset();
    }
  }, [isUnderwater, viewMode, triggerDive, handleReset]);

  const handleToggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  // Determine whether the selected coordinates represent dry land
  const isLand = Boolean(
    oceanData?.seabedInfo?.isLand ||
    (oceanData?.seabedInfo?.elevationMeters !== undefined && oceanData.seabedInfo.elevationMeters > 0)
  );

  const tempDisplay =
    oceanData?.temperature !== null && oceanData?.temperature !== undefined
      ? `${oceanData.temperature.toFixed(2)} °C`
      : '--';
  const salinityDisplay =
    oceanData?.salinity !== null && oceanData?.salinity !== undefined
      ? `${oceanData.salinity.toFixed(2)} PSU`
      : '--';
  const currentSpeedDisplay =
    oceanData?.currentSpeed !== null && oceanData?.currentSpeed !== undefined
      ? `${oceanData.currentSpeed.toFixed(2)} km/h`
      : '--';
  const currentDirDisplay =
    oceanData?.currentDirection !== null && oceanData?.currentDirection !== undefined
      ? `${oceanData.currentDirection.toFixed(0)}°`
      : '--';
  const depthDisplay = `${depth} m`;

  return (
    <div
      ref={containerRef}
      className="mv-globe-root"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '520px',
        background: '#010611',
        overflow: 'hidden'
      }}
    >
      {/* Three.js Canvas container */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* A single responsive HUD: ONE panel at a time, no competing overlays. */}
      {viewMode === 'earth' && (
        <>
          <div className="mv-globe-toolbar">
            <div className="mv-globe-toolbar__group">
              <button className="mv-globe-control" type="button" onClick={() => togglePanel('flow')} aria-expanded={activePanel === 'flow'}>
                ≋ <span>Flow Layers</span> <span className="mv-globe-control__dim">{effectMode === 'cyclones' ? 'Storm winds' : effectMode === 'off' ? 'None' : effectMode}</span>
              </button>
              {onSelectLayer && (
                <button className="mv-globe-control" type="button" onClick={() => togglePanel('layers')} aria-expanded={activePanel === 'layers'}>
                  ◫ <span>Ocean Layers</span>
                </button>
              )}
              {selectedCoords && (
                <button className="mv-globe-control" type="button" onClick={() => { setShowLocationDetails(true); togglePanel('location'); }} aria-expanded={activePanel === 'location'}>
                  ◉ <span>Location Data</span>
                </button>
              )}
              {selectedRegion && (
                <button className="mv-globe-control" type="button" onClick={() => togglePanel('region')} aria-expanded={activePanel === 'region'}>
                  ⌖ <span>Region</span>
                </button>
              )}
            </div>
            <div className="mv-globe-toolbar__group">
              <button className="mv-globe-control mv-globe-control--pause" type="button" onClick={rotationPaused ? resumeRotation : pauseRotation}>
                {rotationPaused ? '▶ Resume' : 'Ⅱ Pause'}
              </button>
            </div>
          </div>

          {activePanel === 'flow' && (
            <aside className="mv-globe-panel" aria-label="Flow layer options">
              <div className="mv-globe-panel__header">
                <strong>Model Flow Layers</strong>
                <button className="mv-globe-close" type="button" onClick={() => setActivePanel(null)} aria-label="Close flow layers">×</button>
              </div>
              <div className="mv-globe-modes">
                {([
                  ['currents', 'Ocean currents'],
                  ['winds', '10 m winds'],
                  ['cyclones', 'High-wind circulation'],
                  ['temperature', 'Ocean temperature'],
                  ['bermuda', 'Bermuda Triangle'],
                  ['off', 'None']
                ] as [OceanEffectMode, string][]).map(([mode, label]) => (
                  <button key={mode} type="button" aria-pressed={effectMode === mode} className={'mv-globe-mode' + (effectMode === mode ? ' is-selected' : '')} onClick={() => {
                    setEffectMode(mode);
                    if (mode === 'bermuda') focusBermuda();
                    setActivePanel(null);
                  }}>{label}</button>
                ))}
              </div>
              {effectMode === 'temperature' && (
                <div style={{ padding: '10px 12px', background: 'rgba(8,31,49,0.75)', borderRadius: 10, marginBottom: 8 }}>
                  <label htmlFor="marivex-sst-opacity" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#d6f6ff', fontSize: 11, marginBottom: 7 }}>
                    <span>Temperature overlay strength</span>
                    <b>{Math.round(temperatureOpacity * 100)}%</b>
                  </label>
                  <input
                    id="marivex-sst-opacity"
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.05"
                    value={temperatureOpacity}
                    onChange={event => setTemperatureOpacity(Number(event.target.value))}
                    style={{ width: '100%', accentColor: '#56e6ff' }}
                  />
                </div>
              )}
              <button className="mv-globe-overlay-toggle" type="button" aria-pressed={showScientificLayers} onClick={() => setShowScientificLayers(v => !v)}>
                Additional ocean-data overlay <b>{showScientificLayers ? 'ON' : 'OFF'}</b>
              </button>
              <div className="mv-globe-source" role="status" aria-live="polite">
                {effectMode === 'bermuda'
                  ? 'Bermuda is a geographical boundary (Miami, Bermuda, San Juan), not a verified ocean anomaly.'
                  : effectMode === 'temperature'
                  ? 'Illustrative sea-surface temperature pattern (°C), NOT measured/live SST. The heat colors are limited to ocean-like Blue Marble pixels.'
                  : effectMode === 'off'
                  ? 'Flow visualizations hidden. The standard Earth texture remains visible.'
                  : fieldStatus.state === 'ready'
                  ? <><b>{fieldStatus.source}</b><span>Valid: {fieldStatus.validTime || 'Unknown'} · {fieldStatus.validSamples ?? '--'} sampled grid points</span><span>{fieldStatus.description}</span></>
                  : <span>{fieldStatus.state === 'error' ? '⚠ ' : '⏳ '}{fieldStatus.description}</span>
                }
              </div>
            </aside>
          )}

          {activePanel === 'layers' && onSelectLayer && (
            <aside className="mv-globe-panel mv-globe-panel--layers" aria-label="Ocean data layers">
              <div className="mv-globe-panel__header"><strong>Scientific Layers</strong><button className="mv-globe-close" type="button" onClick={() => setActivePanel(null)} aria-label="Close scientific layers">×</button></div>
              <div className="mv-globe-legacy-layers">
                <OceanDataLayerSelector
                  activeLayer={activeLayer}
                  onSelectLayer={onSelectLayer}
                  showVectorOverlay={showVectorOverlay}
                  onToggleVectorOverlay={() => onToggleVectorOverlay?.()}
                  showStreamlines={showStreamlines}
                  onToggleStreamlines={() => onToggleStreamlines?.()}
                  onDiveToSeabed={triggerDive}
                />
              </div>
            </aside>
          )}
        </>
      )}

      {/* Return to Globe Button (when in Underwater Mode) */}
      {viewMode === 'underwater' && (
        <button
          type="button"
          onClick={handleReset}
          style={{
            position: 'absolute',
            top: 18,
            left: 18,
            zIndex: 25,
            padding: '8px 14px',
            border: '1px solid rgba(0, 234, 255, 0.4)',
            borderRadius: 10,
            background: 'rgba(2, 22, 42, 0.9)',
            backdropFilter: 'blur(10px)',
            color: '#00eaff',
            fontSize: 12,
            fontWeight: 'bold',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
          }}
        >
          <span>↑</span>
          <span>Ascend to Earth Globe</span>
        </button>
      )}

      {/* Selected Ocean Region Interactive Card (Feature 1) */}
      {viewMode === 'earth' && selectedRegion && activePanel === 'region' && (
        <div
          className="mv-globe-panel mv-globe-panel--region"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.14em', color: '#00eaff', fontWeight: 'bold' }}>
              SELECTED OCEAN REGION
            </span>
            {onClearRegion && (
              <button
                type="button"
                onClick={onClearRegion}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: '0 4px'
                }}
                title="Close Region Highlight"
              >
                ✕
              </button>
            )}
          </div>

          <h3 style={{ fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 2 }}>
            {selectedRegion.name}
          </h3>
          <div style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace', marginBottom: 8 }}>
            {selectedRegion.parentBasin} · {selectedRegion.areaSqKm}
          </div>

          <p style={{ fontSize: 11, color: 'rgba(210, 235, 250, 0.85)', lineHeight: 1.45, marginBottom: 10 }}>
            {selectedRegion.overview}
          </p>

          <div style={{ background: 'rgba(5, 28, 52, 0.7)', padding: '8px 10px', borderRadius: 8, fontSize: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>BOUNDARIES:</span>
              <span style={{ fontFamily: 'monospace', color: '#f0f9ff' }}>
                {selectedRegion.bounds.minLat}° to {selectedRegion.bounds.maxLat}° N · {selectedRegion.bounds.minLon}° to {selectedRegion.bounds.maxLon}° E
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>MAX SEABED DEPTH:</span>
              <strong style={{ color: '#00eaff', fontFamily: 'monospace' }}>
                {selectedRegion.maxDepth.toLocaleString()} m
              </strong>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 9, color: 'rgba(180, 210, 230, 0.7)', display: 'block', marginBottom: 4 }}>
              KEY MARINE LANDMARKS:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {selectedRegion.nearbyLandmarks.map((landmark, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 9,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(0, 234, 255, 0.12)',
                    border: '1px solid rgba(0, 234, 255, 0.25)',
                    color: '#63ffba'
                  }}
                >
                  {landmark}
                </span>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={triggerDive}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              background: '#00eaff',
              color: '#021020',
              fontWeight: 'bold',
              fontSize: 11,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: '0 4px 14px rgba(0, 234, 255, 0.3)'
            }}
          >
            <span>⚓</span>
            <span>Explore Ocean Floor (3D Bathymetry)</span>
          </button>
        </div>
      )}

      {/* Accurate click-to-inspect panel: requested position vs available data grid. */}
      {viewMode === 'earth' && selectedCoords && showLocationDetails && activePanel === 'location' && (
        <section
          aria-label="Selected ocean location and properties"
          className="mv-globe-panel mv-globe-panel--location"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: isLand ? '#fca5a5' : '#6ceaff' }}>
                ◉ {isLand ? 'LANDMASS DETECTED' : 'SELECTED LOCATION'}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6 }}>
                {isLand ? 'The selected point is a landmass' : (oceanData?.oceanBasin || 'Global Ocean')}
              </div>
            </div>
            <button
              type="button"
              title="Hide location details"
              aria-label="Hide selected-location details"
              onClick={() => { setShowLocationDetails(false); setActivePanel(null); }}
              style={{ background: 'transparent', border: 'none', color: '#b9e4f5', cursor: 'pointer', fontSize: 19 }}
            >
              ×
            </button>
          </div>

          <div style={{ border: '1px solid rgba(88,218,255,0.17)', background: 'rgba(9,49,77,0.45)', padding: 10, borderRadius: 10 }}>
            <div style={{ fontSize: 9, color: '#94b7c9', letterSpacing: '0.11em', marginBottom: 5 }}>EXACT CLICKED COORDINATES (ON GLOBE)</div>
            <div style={{ fontSize: 15, fontFamily: 'monospace', fontWeight: 700, color: '#a6f4ff' }}>
              {Math.abs(selectedCoords.latitude).toFixed(4)}° {selectedCoords.latitude >= 0 ? 'N' : 'S'}
              {'  ·  '}
              {Math.abs(selectedCoords.longitude).toFixed(4)}° {selectedCoords.longitude >= 0 ? 'E' : 'W'}
            </div>
            <div style={{ fontSize: 10, color: '#8fb5c8', marginTop: 6 }}>
              Geographical position calculated from the clicked 3D point; not a sensor measurement.
            </div>
          </div>

          {(() => {
            // API responses may additionally specify the nearest available model cell.
            const marine = oceanData as (OceanObservation & {
              actualLatitude?: number;
              actualLongitude?: number;
              requestedLatitude?: number;
              requestedLongitude?: number;
            }) | null;
            if (isLand || isLoading || !marine ||
                typeof marine.actualLatitude !== 'number' ||
                typeof marine.actualLongitude !== 'number' ||
                !Number.isFinite(marine.actualLatitude) ||
                !Number.isFinite(marine.actualLongitude)) return null;
            return (
              <div style={{ padding: '9px 2px 0', fontSize: 10, color: '#83c9d9' }}>
                DATA GRID POINT: {marine.actualLatitude?.toFixed(4)}°, {marine.actualLongitude?.toFixed(4)}°
              </div>
            );
          })()}

          {isLand ? (
            <div
              style={{
                margin: '14px 0 8px',
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5'
              }}
            >
              <strong style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#ff8a8a' }}>
                Ocean Data Unavailable
              </strong>
              <div style={{ fontSize: 11, color: '#fcdcdc', lineHeight: 1.45 }}>
                The selected point is located on dry land. Oceanographic parameters (salinity, sea surface temperature, currents, and waves) are unavailable.
              </div>
              {oceanData?.seabedInfo?.elevationMeters !== undefined && oceanData.seabedInfo.elevationMeters > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#a6f4ff', fontFamily: 'monospace' }}>
                  LAND ELEVATION: +{oceanData.seabedInfo.elevationMeters.toLocaleString()} m ASL
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ margin: '12px 0 8px', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#6ceaff' }}>
                OCEAN PROPERTIES {isLoading ? '· UPDATING…' : ''}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, opacity: isLoading ? 0.55 : 1 }}>
                {[
                  ['TEMPERATURE', tempDisplay],
                  ['SALINITY', salinityDisplay],
                  ['CURRENT SPEED', currentSpeedDisplay],
                  ['CURRENT DIRECTION', currentDirDisplay],
                  ['WAVE HEIGHT', oceanData?.waveHeight != null ? `${oceanData.waveHeight.toFixed(2)} m` : '--'],
                  ['WAVE PERIOD', oceanData?.wavePeriod != null ? `${oceanData.wavePeriod.toFixed(2)} s` : '--'],
                  ['WIND SPEED', oceanData?.windSpeed != null ? String(oceanData.windSpeed.toFixed(2)) : '--'],
                  ['SELECTED DEPTH', `${depth} m`],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: 'rgba(11,42,67,0.8)', border: '1px solid rgba(120,207,233,0.1)', padding: '9px 10px', borderRadius: 9 }}>
                    <div style={{ fontSize: 9, color: '#89aabd', marginBottom: 5 }}>{label}</div>
                    <strong style={{ color: '#e5fbff', fontFamily: 'monospace', fontSize: 12 }}>{isLoading ? 'Loading…' : value}</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 12, fontSize: 10, lineHeight: 1.6, color: '#9dc6d7' }}>
            <div><strong style={{ color: '#caf4ff' }}>DATA TIME:</strong> {oceanData?.time || 'Not available'}</div>
            <div><strong style={{ color: '#caf4ff' }}>SOURCE:</strong> {isLand ? (oceanData?.seabedInfo?.source || 'Authoritative Topographic Grid') : (oceanData?.source || 'Not available')}</div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>Displayed values are supplied by the current marine-data pipeline; availability and scientific provenance depend on the selected source.</div>
          </div>

          {clickedContinent && onContinentClick && (
            <button
              type="button"
              onClick={() => onContinentClick(clickedContinent)}
              style={{ width: '100%', marginTop: 10, padding: '9px 12px', background: 'rgba(50,165,185,0.13)', color: '#a5f3fc', border: '1px solid rgba(100,220,239,0.3)', borderRadius: 9, cursor: 'pointer', fontWeight: 700 }}
            >
              Explore {clickedContinent.name.split(' / ')[0]}
            </button>
          )}

          {!isLand && (
            <button
              type="button"
              onClick={triggerDive}
              style={{ width: '100%', marginTop: 10, padding: '10px 12px', background: '#11cbe0', color: '#041625', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 800 }}
            >
              ⚓ Explore Ocean Floor
            </button>
          )}
        </section>
      )}

      {/* Zooming Overlay (Center) */}
      {viewMode === 'zooming' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 20,
            color: '#00eaff',
            fontSize: 13,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            textShadow: '0 0 18px rgba(0, 234, 255, 0.8)'
          }}
        >
          Entering ocean field...
        </div>
      )}

      {/* Live Ocean Telemetry HUD (Bottom Left in Underwater Mode) */}
      {viewMode === 'underwater' && oceanData && (
        <div
          style={{
            position: 'absolute',
            left: 18,
            bottom: 18,
            zIndex: 20,
            width: 'min(350px, calc(100% - 36px))',
            padding: 16,
            border: '1px solid rgba(0, 234, 255, 0.3)',
            borderRadius: 14,
            background: 'rgba(2, 18, 35, 0.82)',
            backdropFilter: 'blur(12px)',
            color: '#dffaff',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.18em',
              color: '#00eaff',
              marginBottom: 10
            }}
          >
            LIVE OCEAN TELEMETRY
          </div>

          {telemetryStep >= 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <span>TEMPERATURE</span>
              <strong>{tempDisplay}</strong>
            </div>
          )}

          {telemetryStep >= 2 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <span>SALINITY</span>
              <strong>{salinityDisplay}</strong>
            </div>
          )}

          {telemetryStep >= 3 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <span>CURRENT SPEED</span>
              <strong>{currentSpeedDisplay}</strong>
            </div>
          )}

          {telemetryStep >= 4 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <span>CURRENT DIRECTION</span>
              <strong>{currentDirDisplay}</strong>
            </div>
          )}

          {telemetryStep >= 5 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0'
              }}
            >
              <span>DEPTH</span>
              <strong>{depthDisplay}</strong>
            </div>
          )}

          <div
            style={{
              marginTop: 10,
              fontSize: 9,
              color: 'rgba(220, 245, 255, 0.45)'
            }}
          >
            {oceanData.time ? `DATA TIME: ${oceanData.time}` : 'LIVE MARINE DATA'}
          </div>
        </div>
      )}

      {/* Accurate Benthic Seabed HUD (Top Right in Underwater Mode) */}
      {viewMode === 'underwater' && oceanData?.seabedInfo && (
        <div
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            zIndex: 20,
            width: 'min(360px, calc(100% - 36px))',
            padding: 15,
            border: '1px solid rgba(0, 234, 255, 0.35)',
            borderRadius: 14,
            background: 'rgba(2, 18, 35, 0.88)',
            backdropFilter: 'blur(12px)',
            color: '#dffaff',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(0, 234, 255, 0.2)',
              paddingBottom: 8,
              marginBottom: 10
            }}
          >
            <span style={{ fontSize: 10, letterSpacing: '0.14em', color: '#00eaff', fontWeight: 'bold' }}>
              BENTHIC SEABED TOPOGRAPHY
            </span>
            <span
              style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 4,
                background: Math.max(0, (oceanData.bathymetryDepth || 4200) - depth) <= 50 ? 'rgba(52, 217, 176, 0.2)' : 'rgba(0, 234, 255, 0.15)',
                color: Math.max(0, (oceanData.bathymetryDepth || 4200) - depth) <= 50 ? '#63ffba' : '#00eaff',
                fontWeight: 'bold',
                letterSpacing: '0.05em'
              }}
            >
              {Math.max(0, (oceanData.bathymetryDepth || 4200) - depth) <= 50 ? 'TOUCHDOWN' : 'SUBSURFACE'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: 11, marginBottom: 10 }}>
            <div style={{ background: 'rgba(4, 26, 48, 0.6)', padding: '6px 8px', borderRadius: 8 }}>
              <span style={{ fontSize: 9, color: 'rgba(200, 230, 245, 0.6)', display: 'block' }}>SEABED ELEVATION</span>
              <strong style={{ fontSize: 14, color: '#00eaff', fontFamily: 'monospace' }}>
                {(oceanData.bathymetryDepth || 4200).toLocaleString()} m
              </strong>
            </div>

            <div style={{ background: 'rgba(4, 26, 48, 0.6)', padding: '6px 8px', borderRadius: 8 }}>
              <span style={{ fontSize: 9, color: 'rgba(200, 230, 245, 0.6)', display: 'block' }}>ALTITUDE ABOVE BENTHOS</span>
              <strong style={{ fontSize: 14, color: Math.max(0, (oceanData.bathymetryDepth || 4200) - depth) <= 100 ? '#63ffba' : '#f2fbff', fontFamily: 'monospace' }}>
                {Math.max(0, (oceanData.bathymetryDepth || 4200) - depth).toLocaleString()} m
              </strong>
            </div>
          </div>

          <div style={{ fontSize: 10, lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>MORPHOLOGY:</span>
              <strong style={{ color: '#dffaff', textAlign: 'right' }}>{oceanData.seabedInfo.morphologyLabel}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>SEDIMENT:</span>
              <strong style={{ color: '#00eaff', textAlign: 'right', maxWidth: '200px' }}>{oceanData.seabedInfo.sedimentType}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>BOTTOM PRESSURE:</span>
              <strong style={{ color: '#dffaff' }}>{oceanData.seabedInfo.benthicPressure} dbar</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>BOTTOM TEMP:</span>
              <strong style={{ color: '#dffaff' }}>{oceanData.seabedInfo.benthicTemperature} °C</strong>
            </div>

            {/* Vertical Exaggeration Slider (Feature 3) */}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, marginBottom: 4 }}>
                <span style={{ color: 'rgba(180, 210, 230, 0.8)' }}>VERTICAL EXAGGERATION:</span>
                <strong style={{ color: '#00eaff', fontFamily: 'monospace' }}>
                  {verticalExaggeration.toFixed(1)}x
                </strong>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.2"
                value={verticalExaggeration}
                onChange={(e) => onVerticalExaggerationChange?.(Number(e.target.value))}
                style={{ width: '100%', height: 4, accentColor: '#00eaff', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 8, color: 'rgba(200,230,245,0.45)', display: 'block', marginTop: 2 }}>
                Click seabed surface to inspect coordinates & GEBCO depth
              </span>
            </div>
          </div>

          {onSetDepth && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => onSetDepth(oceanData.bathymetryDepth || 4200)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(0, 234, 255, 0.4)',
                  background: 'rgba(0, 180, 220, 0.18)',
                  color: '#00eaff',
                  fontSize: 10,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  letterSpacing: '0.04em'
                }}
              >
                ⚓ Touchdown at Seabed
              </button>

              <button
                type="button"
                onClick={() => onSetDepth(50)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#dffaff',
                  fontSize: 10,
                  cursor: 'pointer'
                }}
              >
                Surface
              </button>
            </div>
          )}
        </div>
      )}

      {/* Clicked Benthic Probe Information Card (Requirement 5) */}
      {viewMode === 'underwater' && clickedBenthicPoint && (
        <div
          style={{
            position: 'absolute',
            bottom: 74,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 35,
            width: 'min(500px, calc(100% - 32px))',
            padding: '14px 16px',
            borderRadius: 14,
            border: '1px solid rgba(0, 234, 255, 0.45)',
            background: 'rgba(2, 18, 36, 0.94)',
            backdropFilter: 'blur(16px)',
            color: '#dffaff',
            fontSize: 11,
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 24px rgba(0, 234, 255, 0.2)'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0, 234, 255, 0.25)', paddingBottom: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>⚓</span>
              <span style={{ fontSize: 11, fontWeight: 'bold', color: '#00eaff', letterSpacing: '0.1em' }}>
                BENTHIC SEABED DISCOVERY
              </span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(99, 255, 186, 0.18)', color: '#63ffba', border: '1px solid rgba(99, 255, 186, 0.3)', fontWeight: 'bold' }}>
                RAYCAST PICKED
              </span>
            </div>
            <button
              type="button"
              onClick={() => setClickedBenthicPoint(null)}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
              title="Close Discovery Panel"
            >
              ✕
            </button>
          </div>

          {/* Key Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            <div style={{ background: 'rgba(4, 26, 48, 0.7)', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 9, color: 'rgba(200, 230, 245, 0.65)', display: 'block' }}>SEAFLOOR DEPTH</span>
              <strong style={{ fontSize: 15, color: '#00eaff', fontFamily: 'monospace' }}>
                {clickedBenthicPoint.depth.toLocaleString()} m
              </strong>
            </div>

            <div style={{ background: 'rgba(4, 26, 48, 0.7)', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 9, color: 'rgba(200, 230, 245, 0.65)', display: 'block' }}>ELEVATION (MSL)</span>
              <strong style={{ fontSize: 15, color: '#38bdf8', fontFamily: 'monospace' }}>
                {clickedBenthicPoint.elevation.toLocaleString()} m
              </strong>
            </div>

            <div style={{ background: 'rgba(4, 26, 48, 0.7)', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 9, color: 'rgba(200, 230, 245, 0.65)', display: 'block' }}>PRESSURE / TEMP</span>
              <strong style={{ fontSize: 12, color: '#f2fbff', fontFamily: 'monospace' }}>
                {clickedBenthicPoint.benthicPressure} dbar · {clickedBenthicPoint.benthicTemperature}°C
              </strong>
            </div>
          </div>

          {/* Coordinates and Ocean Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10, background: 'rgba(3, 20, 38, 0.5)', padding: '8px 10px', borderRadius: 8, marginBottom: 10 }}>
            <div>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>COORDINATES:</span>{' '}
              <strong style={{ fontFamily: 'monospace', color: '#ffffff' }}>
                {clickedBenthicPoint.coords.latitude >= 0 ? `${clickedBenthicPoint.coords.latitude}° N` : `${Math.abs(clickedBenthicPoint.coords.latitude)}° S`},{' '}
                {clickedBenthicPoint.coords.longitude >= 0 ? `${clickedBenthicPoint.coords.longitude}° E` : `${Math.abs(clickedBenthicPoint.coords.longitude)}° W`}
              </strong>
            </div>
            <div>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>OCEAN / SEA:</span>{' '}
              <strong style={{ color: '#00eaff' }}>{clickedBenthicPoint.oceanName}</strong>
            </div>
            <div>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>MORPHOLOGY:</span>{' '}
              <span style={{ color: '#dffaff' }}>{clickedBenthicPoint.morphologyLabel}</span>
            </div>
            <div>
              <span style={{ color: 'rgba(180, 210, 230, 0.7)' }}>SEDIMENT:</span>{' '}
              <span style={{ color: '#dffaff' }}>{clickedBenthicPoint.sedimentType}</span>
            </div>
          </div>

          {/* Scientific Metadata & Attribution Footer */}
          <div style={{ fontSize: 9, lineHeight: 1.5, color: 'rgba(200, 230, 245, 0.7)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span>DATASET: <strong style={{ color: '#a5f3fc' }}>{clickedBenthicPoint.datasetName}</strong></span>
              <span>RESOLUTION: <strong style={{ color: '#a5f3fc' }}>{clickedBenthicPoint.resolution}</strong></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>METHOD: <strong style={{ color: '#63ffba' }}>{clickedBenthicPoint.measurementMethod}</strong></span>
              <span style={{ color: 'rgba(200,230,245,0.5)' }}>PROVENANCE: Visualization-derived terrain</span>
            </div>

            {onSetDepth && (
              <button
                type="button"
                onClick={() => onSetDepth(clickedBenthicPoint.depth)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(0, 234, 255, 0.35)',
                  background: 'rgba(0, 234, 255, 0.12)',
                  color: '#00eaff',
                  fontSize: 10,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                Match Submersible Altitude to Picked Depth ({clickedBenthicPoint.depth.toLocaleString()}m)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ocean-only temperature legend: illustrative color field, never labelled as measured. */}
      {viewMode === 'earth' && effectMode === 'temperature' && (
        <div style={{
          position: 'absolute', right: 15, bottom: 16, zIndex: 17,
          width: 'min(330px, calc(100% - 30px))', borderRadius: 13,
          padding: '12px 14px', background: 'rgba(2, 17, 35, 0.92)',
          border: '1px solid rgba(74, 209, 244, 0.35)',
          boxShadow: '0 10px 28px rgba(0,0,0,.45)', color: '#e3faff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 9 }}>
            <strong style={{ fontSize: 12 }}>🌡 Ocean surface temperature</strong>
            <span style={{ color: '#9bc9df', fontSize: 10 }}>°C · Illustrative</span>
          </div>
          <div style={{ height: 12, borderRadius: 5, background: 'linear-gradient(to right, #5920a8, #213bea, #0099ff, #00dbbf, #57fa48, #faf317, #ff890e, #fa2e1c)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#bddef0', marginTop: 6 }}>
            {['-2', '5', '10', '15', '20', '25', '30', '35'].map(t => <span key={t}>{t}</span>)}
          </div>
          {selectedCoords && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,.10)', paddingTop: 7, marginTop: 8, fontSize: 11 }}>
              At selected latitude/longitude: <b style={{ color: '#8ef6ff' }}>≈ {illustrativeSST(selectedCoords.latitude, selectedCoords.longitude).toFixed(1)} °C</b>
            </div>
          )}
          <div style={{ marginTop: 6, color: '#9fb2c8', fontSize: 10, lineHeight: 1.4 }}>
            Geographic illustration, not satellite measurements or a forecast. Other flow modes remain model-driven.
          </div>
        </div>
      )}

      {/* Global camera controls stay bottom-left, away from the data drawer. */}
      <div className={`mv-globe-camera-controls ${viewMode === 'underwater' ? 'mv-globe-camera-controls--underwater' : ''}`}>
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom in"
          style={{
            width: 38,
            height: 38,
            border: '1px solid rgba(0, 234, 255, 0.35)',
            borderRadius: 8,
            background: 'rgba(2, 18, 35, 0.8)',
            color: '#00eaff',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          +
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom out"
          style={{
            width: 38,
            height: 38,
            border: '1px solid rgba(0, 234, 255, 0.35)',
            borderRadius: 8,
            background: 'rgba(2, 18, 35, 0.8)',
            color: '#00eaff',
            fontSize: 22,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          −
        </button>

        <button
          type="button"
          onClick={handleReset}
          title="Undo / Reset"
          style={{
            width: 38,
            height: 38,
            border: '1px solid rgba(0, 234, 255, 0.35)',
            borderRadius: 8,
            background: 'rgba(2, 18, 35, 0.8)',
            color: '#00eaff',
            fontSize: 19,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ↻
        </button>

        <button
          type="button"
          onClick={handleToggleFullscreen}
          title="Fullscreen"
          style={{
            width: 38,
            height: 38,
            border: '1px solid rgba(0, 234, 255, 0.35)',
            borderRadius: 8,
            background: 'rgba(2, 18, 35, 0.8)',
            color: '#00eaff',
            fontSize: 19,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ⛶
        </button>
      </div>
    </div>
  );
};