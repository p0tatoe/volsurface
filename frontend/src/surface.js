import * as THREE from 'three';
import { colorSchemes } from './config';

export class SurfaceVisualizer {
    constructor(scene) {
        this.scene = scene;
        this.volatilitySurface = null;
        this.pointsMesh = null;
        this.highlightPoint = null;
    }

    createHighlightPoint() {
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
    }

    createVolatilitySurface(dataManager, settings) {
        if (!this.highlightPoint) {
            this.createHighlightPoint();
        }

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

        // Hide highlight point initially
        this.highlightPoint.visible = false;


        if (dataManager.data.volatilityGrid.length === 0) return;

        // Normalize data for visualization
        const normalizedData = dataManager.normalizeData();
        let filteredData = normalizedData;

        // Create surface geometry
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];
        const colorScheme = colorSchemes[settings.colorScheme];

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

                // Check for null values
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

                // Only show points that have actual contract data (contract info exists)
                if (y !== null && dataManager.data.infoGrid[i] && dataManager.data.infoGrid[i][j]) {
                    validPoints.push({ x, y, z, i, j });
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
            flatShading: true
        });

        // Create mesh
        this.volatilitySurface = new THREE.Mesh(geometry, material);

        // Scale and position
        this.volatilitySurface.scale.set(8, 4, 8);
        this.volatilitySurface.position.set(-4, 0, -4);

        // Add to scene
        this.scene.add(this.volatilitySurface);

        // Create InstancedMesh for spheres
        const sphereGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const sphereMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });

        this.pointsMesh = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, validPoints.length);
        this.pointsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        // Store mapping from instanceId to data indices
        this.pointMappings = validPoints.map(p => ({ expIdx: p.i, strikeIdx: p.j }));

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
    }
}
