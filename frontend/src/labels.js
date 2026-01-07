import * as THREE from 'three';

export class LabelManager {
    constructor(scene) {
        this.scene = scene;
        this.labelGroup = null;
    }

    createLabels(data, settings) {
        // Clear previous labels
        if (this.labelGroup) {
            this.labelGroup.traverse((object) => {
                if (object.isMesh || object.isSprite) {
                    if (object.material.map) object.material.map.dispose();
                    object.material.dispose();
                }
            });
            this.scene.remove(this.labelGroup);
        }

        this.labelGroup = new THREE.Group();
        this.scene.add(this.labelGroup);

        // --- Axis Titles ---
        this.addTextLabel('Strike Price', new THREE.Vector3(0, 0, 5.5));
        this.addTextLabel('Days to Expiry', new THREE.Vector3(-5.5, 0, 0));
        this.addTextLabel('Implied Volatility (%)', new THREE.Vector3(0, 5.5, 0));

        // --- Tick Labels ---

        // X-Axis Ticks (Strike)
        const minStrike = data.strikes[0];
        const maxStrike = data.strikes[data.strikes.length - 1];
        if (minStrike !== undefined && maxStrike !== undefined) {
            const xSteps = 5;
            for (let i = 0; i <= xSteps; i++) {
                const t = i / xSteps;
                const worldX = -4 + t * 8;
                const value = minStrike + t * (maxStrike - minStrike);
                this.addTickLabel(value.toFixed(2), new THREE.Vector3(worldX, 0, 4.5));
            }
        }

        // Z-Axis Ticks (Expiry)
        const minExp = data.expirations[0];
        const maxExp = data.expirations[data.expirations.length - 1];
        if (minExp !== undefined && maxExp !== undefined) {
            const zSteps = 5;
            for (let i = 0; i <= zSteps; i++) {
                const t = i / zSteps;
                const worldZ = -4 + t * 8;
                const value = minExp + t * (maxExp - minExp);
                this.addTickLabel(Math.round(value).toString(), new THREE.Vector3(-4.5, 0, worldZ));
            }
        }

        // Y-Axis Ticks (IV)
        const smoothedData = data.volatilityGrid;
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
                this.addTickLabel((value * 100).toFixed(0) + '%', new THREE.Vector3(4.5, worldY, -4.5));
            }
        }
    }

    addTextLabel(text, position, color = 0xffffff) {
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

        this.labelGroup.add(sprite);
    }

    addTickLabel(text, position) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
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

        this.labelGroup.add(sprite);
    }
}
