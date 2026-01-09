import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class LabelManager {
    constructor(scene) {
        this.scene = scene;
        this.labelGroup = null;
    }

    createLabels(data, settings) {
        // Clear previous labels
        if (this.labelGroup && this.labelGroup.traverse) {
            this.labelGroup.traverse((object) => {
                if (object.isCSS2DObject) {
                    object.removeFromParent();
                }
            });
            this.scene.remove(this.labelGroup);
        }

        this.labelGroup = new THREE.Group();
        this.scene.add(this.labelGroup);

        // --- Axis Titles ---
        this.addTextLabel('Strike Price', new THREE.Vector3(0, 0, 7.0));
        this.addTextLabel('Days to Expiry', new THREE.Vector3(-7.5, 0, 0));
        this.addTextLabel('Implied Volatility (%)', new THREE.Vector3(-5.5, 4.5, -5.5));

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
                this.addTickLabel(value.toFixed(2), new THREE.Vector3(worldX, 0, 5.5));
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
                this.addTickLabel(Math.round(value).toString(), new THREE.Vector3(-5.5, 0, worldZ));
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
                this.addTickLabel((value * 100).toFixed(0) + '%', new THREE.Vector3(-5.5, worldY, -5.5), 'right');
            }
        }
    }

    addTextLabel(text, position, color = '#ffffff') {
        const div = document.createElement('div');
        div.className = 'label';
        div.textContent = text;
        div.style.marginTop = '-1em'; // Center vertically
        div.style.color = color;
        div.style.fontFamily = 'Arial, sans-serif';
        div.style.fontSize = '16px';
        div.style.fontWeight = 'bold';
        div.style.textShadow = '1px 1px 2px black';
        div.style.pointerEvents = 'none';
        div.style.whiteSpace = 'nowrap';

        const label = new CSS2DObject(div);
        label.position.copy(position);
        this.labelGroup.add(label);
    }

    addTickLabel(text, position, align = 'center') {
        const div = document.createElement('div');
        div.className = 'tick-label';
        div.textContent = text;
        div.style.color = 'white';
        div.style.fontFamily = 'Arial, sans-serif';
        div.style.fontSize = '12px';
        div.style.textShadow = '1px 1px 2px black';
        div.style.pointerEvents = 'none';
        div.style.whiteSpace = 'nowrap';
        div.style.textAlign = align;

        const label = new CSS2DObject(div);
        label.position.copy(position);
        this.labelGroup.add(label);
    }
}
