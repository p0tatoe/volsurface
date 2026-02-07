
import { DEFAULT_DATA } from './defaultData';

export class DataManager {
    constructor() {
        this.data = {
            ticker: '',
            expirations: [],
            strikes: [],
            volatilityGrid: [],
            infoGrid: []
        };
        // Initialize default data cache
        this.defaultData = { ...DEFAULT_DATA };
    }

    loadDefault() {
        this.data.ticker = "SPY";
        // Use the cached default data
        if (this.defaultData.timestamp) {
            this.data.timestamp = this.defaultData.timestamp;
        }

        // this.defaultData.data is the array of points
        this.rawPoints = this.defaultData.data;
        this.processReceivedData(this.rawPoints);
        return this.data;
    }

    updateDefault(rawData) {
        if (!rawData) return;

        if (Array.isArray(rawData)) {
            // If rawData is just the array of points
            this.defaultData = { data: rawData };
            console.log("Default data cache updated (array format).");
        } else if (rawData.data && Array.isArray(rawData.data)) {
            // If rawData is the object with timestamp
            this.defaultData = rawData;
            console.log("Default data cache updated (object format).");
        }
    }

    async fetchRawData(ticker, type = 'Call') {
        try {
            const response = await fetch(`https://volsurface-backend-564066987828.us-central1.run.app/options-data?ticker=${ticker}&type=${type}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const jsonResponse = await response.json();

            if (jsonResponse.error) {
                throw new Error(jsonResponse.error);
            }

            return jsonResponse;
        } catch (error) {
            console.error("Error fetching raw data:", error);
            throw error;
        }
    }

    async loadData(ticker, type = 'Call', minVolume = 0, minOpenInterest = 0) {
        if (!ticker) return;

        this.data.ticker = ticker;

        try {
            const jsonResponse = await this.fetchRawData(ticker, type);

            let dataPoints;
            if (Array.isArray(jsonResponse)) {
                dataPoints = jsonResponse;
            } else if (jsonResponse.data && Array.isArray(jsonResponse.data)) {
                dataPoints = jsonResponse.data;
                this.data.timestamp = jsonResponse.timestamp;
            } else {
                throw new Error(`Unexpected data format for ${ticker}`);
            }

            if (dataPoints.length === 0) {
                throw new Error(`No data found for ${ticker}. If you are searching for an index, remember to add the ^`);
            }

            this.rawPoints = dataPoints; // Store raw data for reprocessing
            this.processReceivedData(dataPoints, minVolume, minOpenInterest);

            return this.data;

        } catch (error) {
            console.error("Error loading data:", error);
            throw error;
        }
    }

    reprocessData(minVolume, minOpenInterest) {
        if (this.rawPoints) {
            this.processReceivedData(this.rawPoints, minVolume, minOpenInterest);
        }
    }

    processReceivedData(points, minVolume = 0, minOpenInterest = 0) {
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

            // Filter check
            if (volume < minVolume || openInterest < minOpenInterest) {
                return;
            }

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
    }

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
    }

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
    }

    async wakeupBackend() {
        try {
            fetch('https://volsurface-backend-564066987828.us-central1.run.app/');
        } catch (error) {
            console.log("Wakeup call failed", error);
        }
    }
}
