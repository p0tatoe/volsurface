import * as THREE from 'three';

export class InteractionHandler {
    constructor(sceneManager, dataManager, surfaceVisualizer) {
        this.sceneManager = sceneManager;
        this.dataManager = dataManager;
        this.surfaceVisualizer = surfaceVisualizer;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.init();
    }

    init() {
        window.addEventListener('mousemove', (event) => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        });
    }

    update() {
        const pointsMesh = this.surfaceVisualizer.pointsMesh;

        if (pointsMesh) {
            this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
            const intersects = this.raycaster.intersectObject(pointsMesh);

            if (intersects.length > 0) {
                const intersect = intersects[0];
                const instanceId = intersect.instanceId;

                if (instanceId !== undefined && this.surfaceVisualizer.pointMappings[instanceId]) {
                    const mapping = this.surfaceVisualizer.pointMappings[instanceId];
                    const expIdx = mapping.expIdx;
                    const strikeIdx = mapping.strikeIdx;

                    const strike = this.dataManager.data.strikes[strikeIdx];
                    const expiration = this.dataManager.data.expirations[expIdx];
                    const iv = this.dataManager.data.volatilityGrid[expIdx][strikeIdx];
                    const info = this.dataManager.data.infoGrid[expIdx][strikeIdx];

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
                    if (this.surfaceVisualizer.highlightPoint) {
                        this.surfaceVisualizer.highlightPoint.visible = true;

                        // Get position of the instance
                        const matrix = new THREE.Matrix4();
                        pointsMesh.getMatrixAt(instanceId, matrix);
                        const position = new THREE.Vector3();
                        position.setFromMatrixPosition(matrix);

                        this.surfaceVisualizer.highlightPoint.position.copy(position);
                    }
                }
            } else {
                document.getElementById('hoverInfo').innerHTML = '-';
                if (this.surfaceVisualizer.highlightPoint) this.surfaceVisualizer.highlightPoint.visible = false;
            }
        }
    }
}
