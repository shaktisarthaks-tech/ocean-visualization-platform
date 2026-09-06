import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type OceanPoint = {
  id: string;
  latitude: number;
  longitude: number;
  temperature: number;
};

type OceanSceneProps = {
  onPointSelect: (point: OceanPoint) => void;
};

const oceanData: OceanPoint[] = [
  {
    id: "point_001",
    latitude: 20.5,
    longitude: 87.5,
    temperature: 24.6,
  },
  {
    id: "point_002",
    latitude: 10.0,
    longitude: 90.0,
    temperature: 27.2,
  },
  {
    id: "point_003",
    latitude: -5.0,
    longitude: 120.0,
    temperature: 29.1,
  },
  {
    id: "point_004",
    latitude: 30.0,
    longitude: 60.0,
    temperature: 18.5,
  },
  {
    id: "point_005",
    latitude: -15.0,
    longitude: 100.0,
    temperature: 31.0,
  },
];

function OceanScene({
  onPointSelect,
}: OceanSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;

    // =========================
    // SCENE
    // =========================

    const scene = new THREE.Scene();

    scene.background = new THREE.Color(0x020617);

    // =========================
    // CAMERA
    // =========================

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    );

    camera.position.set(0, 0.15, 3);

    // =========================
    // RENDERER
    // =========================

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 2)
    );

    renderer.setSize(
      mount.clientWidth,
      mount.clientHeight
    );

    renderer.outputColorSpace =
      THREE.SRGBColorSpace;

    mount.appendChild(renderer.domElement);

    // =========================
    // CONTROLS
    // =========================

    const controls = new OrbitControls(
      camera,
      renderer.domElement
    );

    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    controls.minDistance = 1.6;
    controls.maxDistance = 5;

    // =========================
    // EARTH GROUP
    // =========================

    const earthGroup = new THREE.Group();

    scene.add(earthGroup);

    // =========================
    // EARTH
    // =========================

    const earthGeometry =
      new THREE.SphereGeometry(1, 96, 96);

    const textureLoader =
      new THREE.TextureLoader();

    const earthTexture =
      textureLoader.load("/earth.jpg");

    earthTexture.colorSpace =
      THREE.SRGBColorSpace;

    const earthMaterial =
      new THREE.MeshPhongMaterial({
        map: earthTexture,
        shininess: 12,
        specular: new THREE.Color(0x222222),
      });

    const earth = new THREE.Mesh(
      earthGeometry,
      earthMaterial
    );

    earthGroup.add(earth);

    // =========================
    // CLOUD LAYER
    // =========================

    const cloudGeometry =
      new THREE.SphereGeometry(
        1.012,
        96,
        96
      );

    const cloudMaterial =
      new THREE.MeshPhongMaterial({
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        color: 0xffffff,
      });

    const clouds = new THREE.Mesh(
      cloudGeometry,
      cloudMaterial
    );

    earthGroup.add(clouds);

    // =========================
    // ATMOSPHERE
    // =========================

    const atmosphereGeometry =
      new THREE.SphereGeometry(
        1.055,
        96,
        96
      );

    const atmosphereMaterial =
      new THREE.MeshBasicMaterial({
        color: 0x4da6ff,
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });

    const atmosphere = new THREE.Mesh(
      atmosphereGeometry,
      atmosphereMaterial
    );

    earthGroup.add(atmosphere);

    // =========================
    // DATA POINTS
    // =========================

    const pointObjects: THREE.Mesh[] = [];

    oceanData.forEach((data) => {
      const radius = 1.075;

      const latitude =
        data.latitude * (Math.PI / 180);

      const longitude =
        data.longitude * (Math.PI / 180);

      const x =
        radius *
        Math.cos(latitude) *
        Math.cos(longitude);

      const y =
        radius *
        Math.sin(latitude);

      const z =
        radius *
        Math.cos(latitude) *
        Math.sin(longitude);

      const pointGeometry =
        new THREE.SphereGeometry(
          0.045,
          24,
          24
        );

      // Temperature colors
      let pointColor = 0x0000ff;

      if (data.temperature >= 30) {
        pointColor = 0xff0000;
      } else if (data.temperature >= 27) {
        pointColor = 0xffff00;
      } else if (data.temperature >= 24) {
        pointColor = 0x00ff00;
      }

      const pointMaterial =
        new THREE.MeshBasicMaterial({
          color: pointColor,
        });

      const point = new THREE.Mesh(
        pointGeometry,
        pointMaterial
      );

      point.position.set(x, y, z);

      // Store the data on the marker
      point.userData = data;

      // Attach marker to Earth
      earthGroup.add(point);

      pointObjects.push(point);
    });

    // =========================
    // LIGHTING
    // =========================

    const sunLight =
      new THREE.DirectionalLight(
        0xffffff,
        3
      );

    sunLight.position.set(
      5,
      2,
      5
    );

    scene.add(sunLight);

    const ambientLight =
      new THREE.AmbientLight(
        0x6688aa,
        0.35
      );

    scene.add(ambientLight);

    // =========================
    // STARS
    // =========================

    const starGeometry =
      new THREE.BufferGeometry();

    const starCount = 1200;

    const starPositions =
      new Float32Array(
        starCount * 3
      );

    for (
      let i = 0;
      i < starCount;
      i++
    ) {
      const radius =
        8 + Math.random() * 12;

      const theta =
        Math.random() * Math.PI * 2;

      const phi =
        Math.acos(
          2 * Math.random() - 1
        );

      starPositions[i * 3] =
        radius *
        Math.sin(phi) *
        Math.cos(theta);

      starPositions[i * 3 + 1] =
        radius *
        Math.cos(phi);

      starPositions[i * 3 + 2] =
        radius *
        Math.sin(phi) *
        Math.sin(theta);
    }

    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        starPositions,
        3
      )
    );

    const starMaterial =
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.025,
      });

    const stars = new THREE.Points(
      starGeometry,
      starMaterial
    );

    scene.add(stars);

    // =========================
    // CLICK DETECTION
    // =========================

    const raycaster =
      new THREE.Raycaster();

    const mouse =
      new THREE.Vector2();

    const handleClick = (
      event: MouseEvent
    ) => {
      const rect =
        renderer.domElement.getBoundingClientRect();

      mouse.x =
        ((event.clientX - rect.left) /
          rect.width) *
          2 -
        1;

      mouse.y =
        -(
          (event.clientY - rect.top) /
          rect.height
        ) *
          2 +
        1;

      raycaster.setFromCamera(
        mouse,
        camera
      );

      const intersections =
        raycaster.intersectObjects(
          pointObjects
        );

      if (intersections.length > 0) {
        const selected =
          intersections[0].object
            .userData as OceanPoint;

        onPointSelect(selected);
      }
    };

    renderer.domElement.addEventListener(
      "click",
      handleClick
    );

    // =========================
    // ANIMATION
    // =========================

    const animate = () => {
      requestAnimationFrame(animate);

      earthGroup.rotation.y += 0.0025;

      clouds.rotation.y += 0.003;

      controls.update();

      renderer.render(
        scene,
        camera
      );
    };

    animate();

    // =========================
    // RESIZE
    // =========================

    const handleResize = () => {
      if (!mount) return;

      camera.aspect =
        mount.clientWidth /
        mount.clientHeight;

      camera.updateProjectionMatrix();

      renderer.setSize(
        mount.clientWidth,
        mount.clientHeight
      );
    };

    window.addEventListener(
      "resize",
      handleResize
    );

    // =========================
    // CLEANUP
    // =========================

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );

      renderer.domElement.removeEventListener(
        "click",
        handleClick
      );

      if (
        mount.contains(
          renderer.domElement
        )
      ) {
        mount.removeChild(
          renderer.domElement
        );
      }

      earthGeometry.dispose();
      earthMaterial.dispose();
      earthTexture.dispose();

      cloudGeometry.dispose();
      cloudMaterial.dispose();

      atmosphereGeometry.dispose();
      atmosphereMaterial.dispose();

      starGeometry.dispose();
      starMaterial.dispose();

      pointObjects.forEach((point) => {
        point.geometry.dispose();

        if (
          point.material instanceof
          THREE.Material
        ) {
          point.material.dispose();
        }
      });

      renderer.dispose();
    };
  }, [onPointSelect]);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
}

export default OceanScene;