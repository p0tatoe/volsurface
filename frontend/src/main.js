import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

// Main application
const app = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    labelGroup: null,
    pointsMesh: null,
    highlightPoint: null,
    volatilitySurface: null,
    colorSchemes: {
        viridis: [
            [0.267, 0.004, 0.329],
            [0.282, 0.094, 0.380],
            [0.278, 0.173, 0.431],
            [0.267, 0.251, 0.478],
            [0.247, 0.329, 0.522],
            [0.220, 0.404, 0.557],
            [0.184, 0.475, 0.576],
            [0.153, 0.549, 0.576],
            [0.122, 0.624, 0.565],
            [0.118, 0.702, 0.529],
            [0.184, 0.780, 0.467],
            [0.322, 0.851, 0.365],
            [0.522, 0.898, 0.231],
            [0.753, 0.918, 0.118]
        ]
    },
    data: {
        ticker: '',
        expirations: [],
        strikes: [],
        expirations: [],
        strikes: [],
        volatilityGrid: [],
        infoGrid: []
    },
    settings: {
        colorScheme: 'viridis'
    },

    init() {
        // Initialize Three.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);

        // Setup camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(5, 5, 5);

        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('container').appendChild(this.renderer.domElement);

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
        const gridHelper = new THREE.GridHelper(10, 10);
        this.scene.add(gridHelper);

        // Add axes
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);

        // Setup event listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.getElementById('loadButton').addEventListener('click', this.loadData.bind(this));

        // Mouse events for raycasting
        window.addEventListener('mousemove', (event) => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });

        // Initial visualization (empty until loaded)
        this.createVolatilitySurface();

        // Start animation loop
        this.animate();
    },

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        // Update controls
        this.controls.update();

        // Raycast for hover info
        if (this.volatilitySurface) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObject(this.volatilitySurface);

            if (intersects.length > 0) {
                const intersect = intersects[0];
                const faceIndex = intersect.faceIndex;

                if (faceIndex >= 0 && this.volatilitySurface.geometry.attributes.position) {
                    // Get exact intersection point in world coordinates
                    const point = intersect.point;

                    // Transform world coordinates back to normalized local coordinates [0, 1]
                    // World bounds: X: [-4, 4], Z: [-4, 4] (mapped from local [0, 1])
                    // worldX = localX * 8 - 4  => localX = (worldX + 4) / 8
                    // worldZ = localZ * 8 - 4  => localZ = (worldZ + 4) / 8

                    const localX = (point.x + 4) / 8;
                    const localZ = (point.z + 4) / 8;

                    const xIndex = Math.round(localX * (this.data.strikes.length - 1));
                    const yIndex = Math.round(localZ * (this.data.expirations.length - 1));

                    if (xIndex >= 0 && xIndex < this.data.strikes.length &&
                        yIndex >= 0 && yIndex < this.data.expirations.length) {
                        const strike = this.data.strikes[xIndex];
                        const expiration = this.data.expirations[yIndex];
                        const iv = this.data.volatilityGrid[yIndex][xIndex];

                        const info = this.data.infoGrid[yIndex][xIndex];

                        let infoHtml = `Strike: ${strike.toFixed(2)}<br>` +
                            `Days to Expiry: ${expiration}<br>` +
                            `Implied Volatility: ${(iv * 100).toFixed(2)}%`;

                        if (info) {
                            infoHtml += `<br><br><strong>${info.symbol}</strong><br>` +
                                `Price: $${info.lastPrice}<br>` +
                                `Bid/Ask: ${info.bid}/${info.ask}<br>` +
                                `Vol/OI: ${info.volume}/${info.openInterest}`;
                        }

                        document.getElementById('hoverInfo').innerHTML = infoHtml;

                        // Update highlight point
                        if (this.highlightPoint) {
                            this.highlightPoint.visible = true;
                            // Calculate exact position of this grid point
                            const gridX = xIndex / (this.data.strikes.length - 1); // 0 to 1
                            const gridZ = yIndex / (this.data.expirations.length - 1); // 0 to 1
                            const gridY = iv !== null ? iv : 0; // Should be valid if we are here

                            const localX = xIndex / (this.data.strikes.length - 1);
                            const localZ = yIndex / (this.data.expirations.length - 1);

                            const worldX = localX * 8 - 4;
                            const worldZ = localZ * 8 - 4;

                            const cols = this.data.strikes.length;
                            const index = yIndex * cols + xIndex;

                            if (this.pointsMesh && index >= 0 && index < this.pointsMesh.count) {
                                const matrix = new THREE.Matrix4();
                                this.pointsMesh.getMatrixAt(index, matrix);
                                const position = new THREE.Vector3();
                                position.setFromMatrixPosition(matrix);
                                this.highlightPoint.position.copy(position);
                            }
                        }

                    }
                }
            } else {
                document.getElementById('hoverInfo').innerHTML = '-';
                if (this.highlightPoint) this.highlightPoint.visible = false;
            }
        }

        // Render scene
        this.renderer.render(this.scene, this.camera);
    },

    async loadData() {
        const ticker = document.getElementById('ticker').value.toUpperCase();
        if (!ticker) return;

        this.data.ticker = ticker;

        // Show loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = `<h3>Loading data for ${ticker}...</h3>`;
        document.getElementById('container').appendChild(loadingDiv);

        try {
            // Fetch data from the backend
            const response = await fetch('https://volsurface-backend-564066987828.us-central1.run.app/options-data?ticker=' + ticker);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            if (!Array.isArray(data) || data.length === 0) {
                throw new Error("No data received");
            }

            this.processReceivedData(data);

            // Update data info
            document.getElementById('dataInfo').innerHTML =
                `<strong>${ticker}</strong><br>` +
                `${this.data.expirations.length} expirations<br>` +
                `${this.data.strikes.length} strikes`;

            // Create volatility surface
            this.createVolatilitySurface();

        } catch (error) {
            console.error("Error loading data:", error);
            alert(`Error loading data: ${error.message}`);
        } finally {
            // Remove loading indicator
            if (document.getElementById('container').contains(loadingDiv)) {
                document.getElementById('container').removeChild(loadingDiv);
            }
        }
    },

    processReceivedData(points) {

        const expirationsSet = new Set(points.map(p => p[0])); // daysToExpiration
        const moneynessSet = new Set(points.map(p => p[2])); // Moneyness

        this.data.expirations = Array.from(expirationsSet).sort((a, b) => a - b);

        // We can use Moneyness as the "Strike" axis for visualization purposes
        const moneynessSorted = Array.from(moneynessSet).sort((a, b) => a - b);
        this.data.strikes = moneynessSorted; // Using moneyness as the x-axis values

        // Initialize grid with null to distinguish missing data
        this.data.volatilityGrid = Array(this.data.expirations.length).fill().map(() =>
            Array(this.data.strikes.length).fill(null)
        );
        this.data.infoGrid = Array(this.data.expirations.length).fill().map(() =>
            Array(this.data.strikes.length).fill(null)
        );

        // Fill the grid with known values
        points.forEach(point => {
            const [expiry, iv, moneyness, symbol, lastPrice, bid, ask, volume, openInterest] = point;
            const expIdx = this.data.expirations.indexOf(expiry);
            const monIdx = this.data.strikes.indexOf(moneyness);

            if (expIdx !== -1 && monIdx !== -1) {
                this.data.volatilityGrid[expIdx][monIdx] = iv;
                this.data.infoGrid[expIdx][monIdx] = {
                    symbol, lastPrice, bid, ask, volume, openInterest
                };
            }
        });

        // Fill missing values using iterative averaging (hole filling)
        this.fillMissingValues();

        // Interpolate missing values (simple neighbor fill for visualization if needed, or leave as 0)
        // For now, leaving as is. The surface creation handles it but might look spiked if sparse.
    },

    createVolatilitySurface() {
        // Remove previous surface if it exists
        if (this.volatilitySurface) {
            this.scene.remove(this.volatilitySurface);
            this.volatilitySurface.geometry.dispose();
            this.volatilitySurface.material.dispose();
        }

        // Remove previous points if they exist
        if (this.pointsMesh) {
            this.scene.remove(this.pointsMesh);
            this.pointsMesh.geometry.dispose();
            this.pointsMesh.material.dispose();
        }

        // Remove highlight point if exists (to recreate or just hide needs logic, but safer to recreate if data changes)
        if (this.highlightPoint) {
            this.scene.remove(this.highlightPoint);
            // Geometry/Material are shared in highlight usually? No, we create new.
            // Actually, we should dispose them.
            if (this.highlightPoint.geometry) this.highlightPoint.geometry.dispose();
            if (this.highlightPoint.material) this.highlightPoint.material.dispose();
            this.highlightPoint = null;
        }

        if (this.data.volatilityGrid.length === 0) return;

        // Normalize data for visualization (no smoothing)
        const normalizedData = this.normalizeData();
        let filteredData = normalizedData;

        // Create surface geometry
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];
        const colorScheme = this.colorSchemes[this.settings.colorScheme];

        // For points (spheres)
        const validPoints = [];

        // Loop through data grid to create triangles
        for (let i = 0; i < normalizedData.length - 1; i++) {
            for (let j = 0; j < normalizedData[i].length - 1; j++) {
                // Get the four corners of the current grid cell
                const x1 = j / (normalizedData[i].length - 1);
                const z1 = i / (normalizedData.length - 1);
                const y1 = normalizedData[i][j];

                const x2 = (j + 1) / (normalizedData[i].length - 1);
                const z2 = i / (normalizedData.length - 1);
                const y2 = normalizedData[i][j + 1];

                const x3 = j / (normalizedData[i].length - 1);
                const z3 = (i + 1) / (normalizedData.length - 1);
                const y3 = normalizedData[i + 1][j];

                const x4 = (j + 1) / (normalizedData[i].length - 1);
                const z4 = (i + 1) / (normalizedData.length - 1);
                const y4 = normalizedData[i + 1][j + 1];

                // Check for null values (holes that couldn't be filled) - although we fill them, good to be safe.
                // If any corner is null (shouldn't happen with our filling logic unless completely empty), skip.
                if (filteredData && (y1 === null || y2 === null || y3 === null || y4 === null)) continue;

                // Triangle 1: (x1,y1,z1), (x2,y2,z2), (x3,y3,z3)
                vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);

                // Triangle 2: (x2,y2,z2), (x4,y4,z4), (x3,y3,z3)
                vertices.push(x2, y2, z2, x4, y4, z4, x3, y3, z3);

                // Add colors based on y values
                [y1, y2, y3, y2, y4, y3].forEach(y => {
                    const colorIndex = Math.min(
                        Math.floor(y * colorScheme.length),
                        colorScheme.length - 1
                    );
                    const color = colorScheme[colorIndex];
                    colors.push(color[0], color[1], color[2]);
                });
            }
        }

        // Collect valid points for spheres
        for (let i = 0; i < normalizedData.length; i++) {
            for (let j = 0; j < normalizedData[i].length; j++) {
                const x = j / (normalizedData[i].length - 1);
                const z = i / (normalizedData.length - 1);
                const y = normalizedData[i][j];

                if (y !== null) {
                    validPoints.push({ x, y, z });
                }
            }
        }

        // Set geometry attributes
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        // Create material
        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            shininess: 0,
            flatShading: true // Requested flat surface
        });

        // Create mesh
        this.volatilitySurface = new THREE.Mesh(geometry, material);

        // Scale and position
        // Scale and position
        this.volatilitySurface.scale.set(8, 4, 8);
        this.volatilitySurface.position.set(-4, 0, -4);

        // Add to scene
        this.scene.add(this.volatilitySurface);

        // Create InstancedMesh for spheres
        const sphereGeometry = new THREE.SphereGeometry(0.08, 8, 8); // Small spheres, low poly
        const sphereMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });

        this.pointsMesh = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, validPoints.length);
        this.pointsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const dummy = new THREE.Object3D();
        for (let i = 0; i < validPoints.length; i++) {
            const p = validPoints[i];
            // Scale coords to world
            dummy.position.set(p.x * 8 - 4, p.y * 4, p.z * 8 - 4);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            this.pointsMesh.setMatrixAt(i, dummy.matrix);
        }

        this.pointsMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(this.pointsMesh);

        // Create highlight sphere
        const highlightGeometry = new THREE.SphereGeometry(0.12, 16, 16); // Slightly bigger, smoother
        const highlightMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0x550000,
            transparent: false
        });
        this.highlightPoint = new THREE.Mesh(highlightGeometry, highlightMaterial);
        this.highlightPoint.visible = false;
        this.scene.add(this.highlightPoint);

        // Add labels
        this.addLabels();
    },

    normalizeData() {
        const data = this.data.volatilityGrid;

        // Find min and max values
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < data.length; i++) {
            for (let j = 0; j < data[i].length; j++) {
                if (data[i][j] !== null) {
                    min = Math.min(min, data[i][j]);
                    max = Math.max(max, data[i][j]);
                }
            }
        }

        // Normalize data to [0, 1] range
        return data.map(row =>
            row.map(val => val !== null ? (val - min) / (max - min) : null)
        );
    },

    fillMissingValues() {
        const grid = this.data.volatilityGrid;
        const rows = grid.length;
        const cols = grid[0].length;
        let hasChanges = true;
        let iterations = 0;
        const maxIterations = 50; // Prevent infinite loops

        while (hasChanges && iterations < maxIterations) {
            hasChanges = false;
            iterations++;
            const newGrid = grid.map(row => [...row]);

            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    if (grid[i][j] === null) {
                        let sum = 0;
                        let count = 0;

                        // Check 8 neighbors
                        for (let di = -1; di <= 1; di++) {
                            for (let dj = -1; dj <= 1; dj++) {
                                if (di === 0 && dj === 0) continue;
                                const ni = i + di;
                                const nj = j + dj;
                                if (ni >= 0 && ni < rows && nj >= 0 && nj < cols && grid[ni][nj] !== null) {
                                    sum += grid[ni][nj];
                                    count++;
                                }
                            }
                        }

                        if (count > 0) {
                            newGrid[i][j] = sum / count;
                            hasChanges = true;
                        }
                    }
                }
            }
            // Update grid
            for (let i = 0; i < rows; i++) {
                this.data.volatilityGrid[i] = newGrid[i];
            }
        }

        // Final pass: if any nulls remain (disconnected islands), set to 0 or min?
        // Let's set to nearest valid or 0.
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                if (this.data.volatilityGrid[i][j] === null) {
                    this.data.volatilityGrid[i][j] = 0;
                }
            }
        }
    },

    addLabels() {
        // Clear previous labels
        if (this.labelGroup) {
            this.labelGroup.traverse((object) => {
                if (object.isMesh || object.isSprite) {
                    if (object.material.map) object.material.map.dispose();
                    object.material.dispose();
                    // object.geometry.dispose(); // Sprites don't strictly have geometry in the same way, but good practice if it did.
                }
            });
            this.scene.remove(this.labelGroup);
        }

        this.labelGroup = new THREE.Group();
        this.scene.add(this.labelGroup);

        // Add axis labels
        const addTextLabel = (text, position, color = 0xffffff) => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 512;
            canvas.height = 128;

            context.fillStyle = 'rgba(0,0,0,0)'; // Transparent
            context.clearRect(0, 0, canvas.width, canvas.height);

            context.font = 'bold 48px Arial';
            context.fillStyle = '#ffffff';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(text, canvas.width / 2, canvas.height / 2);

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(material);
            sprite.position.copy(position);
            sprite.scale.set(2, 0.5, 1);

            this.labelGroup.add(sprite); // Add to group
            return sprite;
        };

        // Helper for tick labels (smaller font)
        const addTickLabel = (text, position) => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256; // Higher resolution
            canvas.height = 64;

            context.font = 'bold 40px Arial';
            context.fillStyle = '#ffffff';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(text, canvas.width / 2, canvas.height / 2);

            const texture = new THREE.CanvasTexture(canvas);
            const material = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(material);
            sprite.position.copy(position);
            sprite.scale.set(1, 0.25, 1); // Maintain world scale

            this.labelGroup.add(sprite); // Add to group
        };

        // --- Axis Titles ---
        // X-axis label (Strike Price)
        addTextLabel('Strike Price', new THREE.Vector3(0, 0, 5.5));

        // Z-axis label (Days to Expiry) - was Y
        addTextLabel('Days to Expiry', new THREE.Vector3(-5.5, 0, 0));

        // Y-axis label (Implied Volatility) - was Z
        addTextLabel('Implied Volatility (%)', new THREE.Vector3(0, 5.5, 0));

        // --- Tick Labels ---

        // X-Axis Ticks (Strike)
        // Range from -4 to 4 in world space maps to minStrike to maxStrike
        const minStrike = this.data.strikes[0];
        const maxStrike = this.data.strikes[this.data.strikes.length - 1];
        if (minStrike !== undefined && maxStrike !== undefined) {
            const xSteps = 5;
            for (let i = 0; i <= xSteps; i++) {
                const t = i / xSteps;
                const worldX = -4 + t * 8;
                const value = minStrike + t * (maxStrike - minStrike);
                addTickLabel(value.toFixed(2), new THREE.Vector3(worldX, 0, 4.5));
            }
        }

        // Z-Axis Ticks (Expiry)
        // Range from -4 to 4 in world space
        const minExp = this.data.expirations[0];
        const maxExp = this.data.expirations[this.data.expirations.length - 1];
        if (minExp !== undefined && maxExp !== undefined) {
            const zSteps = 5;
            for (let i = 0; i <= zSteps; i++) {
                const t = i / zSteps;
                const worldZ = -4 + t * 8;
                const value = minExp + t * (maxExp - minExp);
                addTickLabel(Math.round(value).toString(), new THREE.Vector3(-4.5, 0, worldZ));
            }
        }

        // Y-Axis Ticks (IV)
        const smoothedData = this.data.volatilityGrid;
        let minIV = Infinity;
        let maxIV = -Infinity;
        for (let row of smoothedData) {
            for (let val of row) {
                if (val !== null) {
                    minIV = Math.min(minIV, val);
                    maxIV = Math.max(maxIV, val);
                }
            }
        }


        if (minIV !== Infinity) {
            const ySteps = 4;
            for (let i = 0; i <= ySteps; i++) {
                const t = i / ySteps;
                const worldY = 0 + t * 4; // Height is 4
                const value = minIV + t * (maxIV - minIV);
                addTickLabel((value * 100).toFixed(0) + '%', new THREE.Vector3(4.5, worldY, -4.5));
            }
        }
    },


};

// Start the application when the page loads
window.addEventListener('load', () => app.init());
