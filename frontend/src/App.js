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

        const minVolumeInput = document.getElementById('minVolume');
        const minOpenInterestInput = document.getElementById('minOpenInterest');

        // Set default values from settings
        if (minVolumeInput) minVolumeInput.value = this.settings.minVolume;
        if (minOpenInterestInput) minOpenInterestInput.value = this.settings.minOpenInterest;

        // Add listeners for filters
        const updateFilters = () => {
            const minVol = parseInt(minVolumeInput.value) || 0;
            const minOI = parseInt(minOpenInterestInput.value) || 0;

            this.dataManager.reprocessData(minVol, minOI);
            this.surfaceVisualizer.createVolatilitySurface(this.dataManager, this.settings);
            // Re-create labels if data ranges changed significantly? 
            // Usually strict reprocessing doesn't change axis ranges unless we refilter strikes/expirations completely.
            // For now, let's keep labels as is or update them. 
            // Ideally we re-normalize and that might change min/max IV.
            this.labelManager.createLabels(this.dataManager.data, this.settings);
        };

        minVolumeInput.addEventListener('change', updateFilters);
        minOpenInterestInput.addEventListener('change', updateFilters);

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

        const minVolumeInput = document.getElementById('minVolume');
        const minOpenInterestInput = document.getElementById('minOpenInterest');
        const minVol = parseInt(minVolumeInput.value) || 0;
        const minOI = parseInt(minOpenInterestInput.value) || 0;

        if (!ticker) return;

        // Show loading state
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = `<h3>Loading ${type} data for ${ticker}...</h3>`;
        document.getElementById('container').appendChild(loadingDiv);

        try {
            await this.dataManager.loadData(ticker, type, minVol, minOI);

            // Update UI
            document.getElementById('dataInfo').innerHTML =
                `<strong>${ticker}</strong><br>` +
                `${this.dataManager.data.expirations.length} expirations<br>` +
                `${this.dataManager.data.strikes.length} strikes`;

            // Update Dynamic Title
            const titleElement = document.getElementById('dynamicTitle');
            if (titleElement) {
                let timeString = '';
                if (this.dataManager.data.timestamp) {
                    const date = new Date(this.dataManager.data.timestamp);
                    // Format: 1/15/2026 4:30 ET
                    const options = {
                        year: 'numeric',
                        month: 'numeric',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric',
                        timeZone: 'America/New_York',
                        timeZoneName: 'short'
                    };
                    timeString = new Intl.DateTimeFormat('en-US', options).format(date);
                }
                titleElement.textContent = `${ticker} as of ${timeString}`;
            }

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
