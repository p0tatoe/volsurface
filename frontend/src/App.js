import { colorSchemes, defaultSettings } from './config';
import { SceneManager } from './scene';
import { DataManager } from './data';
import { SurfaceVisualizer } from './surface';
import { LabelManager } from './labels';
import { InteractionHandler } from './interaction';

export class App {
    constructor() {
        this.settings = { ...defaultSettings };

        // Initialize managers
        this.sceneManager = new SceneManager('container');
        this.dataManager = new DataManager();
        this.surfaceVisualizer = new SurfaceVisualizer(this.sceneManager.scene);
        this.labelManager = new LabelManager(this.sceneManager.scene);

        // Interaction handler depends on others
        this.interactionHandler = new InteractionHandler(
            this.sceneManager,
            this.dataManager,
            this.surfaceVisualizer
        );

        this.init();
    }

    init() {
        // Setup UI event listeners
        document.getElementById('loadButton').addEventListener('click', () => this.loadData());

        // Start animation loop
        this.animate();

        // Load default data
        this.loadData();
    }

    async loadData() {
        const tickerInput = document.getElementById('ticker');
        const ticker = tickerInput.value.toUpperCase();
        const toggle = document.getElementById('optionTypeToggle');
        const type = toggle && toggle.checked ? 'Put' : 'Call';

        if (!ticker) return;

        // Show loading state
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = `<h3>Loading ${type} data for ${ticker}...</h3>`;
        document.getElementById('container').appendChild(loadingDiv);

        try {
            await this.dataManager.loadData(ticker, type);

            // Update UI
            document.getElementById('dataInfo').innerHTML =
                `<strong>${ticker}</strong><br>` +
                `${this.dataManager.data.expirations.length} expirations<br>` +
                `${this.dataManager.data.strikes.length} strikes`;

            // Visualize
            this.surfaceVisualizer.createVolatilitySurface(this.dataManager, this.settings);
            this.labelManager.createLabels(this.dataManager.data, this.settings);

        } catch (error) {
            alert(`Error loading data: ${error.message}`);
        } finally {
            if (document.getElementById('container').contains(loadingDiv)) {
                document.getElementById('container').removeChild(loadingDiv);
            }
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        this.sceneManager.update();
        this.interactionHandler.update();
        this.sceneManager.render();
    }
}
