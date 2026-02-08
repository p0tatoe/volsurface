import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class SceneManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.labelRenderer = null;
        this.controls = null;


        this.init();
    }

    init() {
        // Initialize Three.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);

        // Setup camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(-7, 7, 7);

        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        // Setup label renderer
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.container.appendChild(this.labelRenderer.domElement);

        // Setup orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.25;

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        // Add grid
        const gridHelper = new THREE.GridHelper(8, 5, 0x555555, 0x333333);
        this.scene.add(gridHelper);

        // Add custom axes
        this.createCustomAxes();

        // Setup resize handler
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    }

    update() {
        this.controls.update();
    }

    render() {
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    createCustomAxes() {
        const material = new THREE.LineBasicMaterial({ color: 0xffffff });
        const vertices = [];

        // X-Axis (at z=5.5)
        // Main line
        vertices.push(-4, 0, 5.5, 4, 0, 5.5);
        // Ticks
        const xSteps = 5;
        for (let i = 0; i <= xSteps; i++) {
            const t = i / xSteps;
            const x = -4 + t * 8;
            vertices.push(x, 0, 5.5, x, 0, 5.3);
        }

        // Z-Axis (at x=-5.5)
        // Main line
        vertices.push(-5.5, 0, -4, -5.5, 0, 4);
        // Ticks
        const zSteps = 5;
        for (let i = 0; i <= zSteps; i++) {
            const t = i / zSteps;
            const z = -4 + t * 8;
            vertices.push(-5.5, 0, z, -5.3, 0, z);
        }

        // Y-Axis (at x=-5.5, z=-5.5)
        // Main line
        vertices.push(-5.5, 0, -5.5, -5.5, 4, -5.5);
        // Ticks
        const ySteps = 4;
        for (let i = 0; i <= ySteps; i++) {
            const t = i / ySteps;
            const y = 0 + t * 4;
            vertices.push(-5.5, y, -5.5, -5.3, y, -5.5);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const axes = new THREE.LineSegments(geometry, material);
        this.scene.add(axes);
    }
}
