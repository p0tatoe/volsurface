from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import os
import uvicorn
import yfinance as yf
import pandas as pd
from datetime import datetime as dt
import numpy as np
from scipy.interpolate import Rbf
from scipy.spatial import cKDTree

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def normalize(series, new_min=0, new_max=1):
    min_value = series.min()
    max_value = series.max()
    scaledseries = ((series - min_value) / (max_value - min_value)) * (new_max - new_min) + new_min
    return scaledseries

def get_data(ticker_symbol):
    ticker = yf.Ticker(ticker_symbol)
    
    options_dates = ticker.options
    
    if not options_dates:
        print(f"No options found for {ticker_symbol}")
        return pd.DataFrame()

    all_options = pd.DataFrame()
    
    for date in options_dates:
        try:
            opt = ticker.option_chain(date)
            calls = opt.calls
            if not calls.empty:
                calls['Expiry'] = date
                calls['Type'] = 'Call'
                all_options = pd.concat([all_options, calls])
            
            puts = opt.puts
            if not puts.empty:
                puts['Expiry'] = date
                puts['Type'] = 'Put'
                all_options = pd.concat([all_options, puts])
        except Exception as e:
            print(f"Error fetching options for {date}: {e}")
            continue
            
    if all_options.empty:
        return pd.DataFrame()

    all_options['Date'] = dt.now().strftime('%Y-%m-%d')
    all_options['Expiry'] = pd.to_datetime(all_options['Expiry'])
    all_options['daysToExpiration'] = (all_options['Expiry'] - pd.to_datetime(all_options['Date'])).dt.days
    
    today = dt.now().strftime('%Y-%m-%d')
    try:
        data = yf.download(ticker_symbol if not ticker_symbol.startswith('^') and options_dates else ticker.ticker, period='1d', interval='1m')
        current_price = data['Close'].iloc[-1]
        if isinstance(current_price, pd.Series):
             current_price = current_price.item()
    except Exception:
        # Fallback if download fails
        info = ticker.info
        current_price = (
            info.get('currentPrice') or
            info.get('regularMarketPrice') or
            info.get('previousClose') or
            info.get('open') or
            0
        )

    all_options["strike"] = pd.to_numeric(all_options["strike"], errors='coerce')
    all_options["Moneyness"] = current_price / all_options["strike"]
    
    return all_options

@app.get('/options-data')
async def make_table(ticker: str = Query("META"), type: str = Query("Call")):
    try:
        options = get_data(ticker)
        
        if options.empty:
            return []
            
        # Filter by the requested type (Call or Put)
        filtered_df = options[options["Type"] == type]
        
        focuseddf = filtered_df[[
            "daysToExpiration", 
            "impliedVolatility", 
            "Moneyness", 
            "contractSymbol", 
            "lastPrice", 
            "bid", 
            "ask", 
            "volume", 
            "openInterest"
        ]].dropna(subset=["daysToExpiration", "impliedVolatility", "Moneyness"])

        desired_columns = [
            "daysToExpiration", 
            "impliedVolatility", 
            "Moneyness", 
            "contractSymbol", 
            "lastPrice", 
            "bid", 
            "ask", 
            "volume", 
            "openInterest"
        ]

        # Ensure columns exist to prevent crash
        for col in desired_columns:
            if col not in filtered_df.columns:
                print(f"Warning: Column '{col}' missing from data. Filling with default.")
                filtered_df[col] = 0 if col != 'contractSymbol' else "N/A"
        
        focuseddf = filtered_df[desired_columns].dropna(subset=["daysToExpiration", "impliedVolatility", "Moneyness"])
        
        # Prune outliers
        strike_range = 0.50
        # Prune outliers
        strike_range = 0.50
        pruneddf = focuseddf[
            (focuseddf["Moneyness"] >= (1 - strike_range)) &
            (focuseddf["Moneyness"] <= (1 + strike_range)) &
            (focuseddf["impliedVolatility"] <= 2) &
            (focuseddf['impliedVolatility'] >= 0.001) &
            (focuseddf['daysToExpiration'] <= 61)
        ].copy()

        if pruneddf.empty:
             return {"data": [], "timestamp": dt.now().isoformat()}
        
        # --- RBF Interpolation & Geometry Generation ---
        
        # Extract data for RBF
        x = pruneddf["daysToExpiration"].values
        y = pruneddf["Moneyness"].values
        z = pruneddf["impliedVolatility"].values
        
        # Create grid
        # We want a smooth surface, so we'll generate a regular grid
        # covering the range of data.
        grid_resolution_x = 50 # steps for expiration
        grid_resolution_y = 50 # steps for moneyness
        
        x_min, x_max = x.min(), x.max()
        y_min, y_max = y.min(), y.max()
        
        # Add a small buffer to the grid edges
        x_buffer = (x_max - x_min) * 0.05
        y_buffer = (y_max - y_min) * 0.05
        
        xi = np.linspace(x_min - x_buffer, x_max + x_buffer, grid_resolution_x)
        yi = np.linspace(y_min - y_buffer, y_max + y_buffer, grid_resolution_y)
        XI, YI = np.meshgrid(xi, yi)
        
        # RBF Interpolation
        # 'thin_plate' is often good for smooth surfaces, or 'multiquadric'
        try:
            rbf = Rbf(x, y, z, function='thin_plate', smooth=0.1)
            ZI = rbf(XI, YI)
        except Exception as rbf_error:
            print(f"RBF Error: {rbf_error}. Fallback to linear.")
            # Fallback if RBF fails (e.g., too few points)
            from scipy.interpolate import griddata
            ZI = griddata((x, y), z, (XI, YI), method='linear', fill_value=0)

        # Masking
        # Mask points too far from actual data
        # We need to find the distance from each grid point (XI, YI) to the nearest real data point (x, y)
        
        # Flatten grid for distance calculation
        grid_points = np.column_stack((XI.flatten(), YI.flatten()))
        data_points_coords = np.column_stack((x, y))
        
        # Use cKDTree for efficient nearest neighbor search
        tree = cKDTree(data_points_coords)
        distances, _ = tree.query(grid_points)
        
        # Define a specialized distance threshold. 
        # Since x (days) and y (moneyness) have vastly different scales (e.g., 0-60 vs 0.5-1.5),
        # we should probably normalize them for distance calculation or pick a threshold that works.
        # However, to keep it simple and robust, let's normalize just for the distance check.
        
        x_norm_scale = 1.0 / (x_max - x_min) if x_max > x_min else 1.0
        y_norm_scale = 1.0 / (y_max - y_min) if y_max > y_min else 1.0
        
        data_points_norm = np.column_stack((x * x_norm_scale, y * y_norm_scale))
        grid_points_norm = np.column_stack((XI.flatten() * x_norm_scale, YI.flatten() * y_norm_scale))
        
        tree_norm = cKDTree(data_points_norm)
        dist_norm, _ = tree_norm.query(grid_points_norm)
        
        # Threshold: if distance is > 10% of the diagonal of the bounding box
        mask_threshold = 0.15 
        
        mask = dist_norm > mask_threshold
        ZI_flat = ZI.flatten()
        ZI_flat[mask] = np.nan # Mark as invalid
        
        # --- Generate BufferGeometry Data ---
        
        # Normalize coordinates for visualization (to [0, 1] range) similar to frontend 'normalize' logic
        # But wait, frontend maps [0,1] to World coords [-4, 4], [0, 4] etc.
        # Let's return normalized [0, 1] coordinates in the geometry attributes
        # and let the frontend Apply the scale.
        
        # Find global min/max for normalization (using the grid extent or data extent?)
        # Use Grid extent + Z data min/max
        z_min = z.min()
        z_max = z.max()
        if z_max == z_min: z_max += 1 # prevent div by zero
        
        # Normalize XI, YI, ZI
        # x is 0..1 (Expiration), y is 0..1 (IV - height), z is 0..1 (Strike/Moneyness) 
        # CAREFUL: Frontend logic map:
        # x-axis (3D) = index in strike array -> Normalized Strike/Moneyness
        # z-axis (3D) = index in expiration array -> Normalized Expiration
        # y-axis (3D) = IV -> Normalized IV
        
        # So:
        # 3D X = Normalized Y (Moneyness)
        # 3D Y = Normalized Z (IV)
        # 3D Z = Normalized X (Expiration)
        
        norm_X_exp = (XI.flatten() - x_min) / (x_max - x_min)
        norm_Y_mon = (YI.flatten() - y_min) / (y_max - y_min)
        norm_Z_iv = (ZI_flat - z_min) / (z_max - z_min)
        
        # Prepare arrays
        positions = []
        colors = [] # We can generate colors here or in shader. Let's do vertex colors.
        indices = []
        
        # Helper to map grid index to valid vertex index
        # We need to skip masked points.
        # But BufferGeometry requires a continuous list of vertices if we use an index buffer?
        # Actually, we can just dump all grid vertices (including masked ones with NaN) 
        # but NOT include them in the index buffer (triangles).
        # OR we can filter them out. Filtering is cleaner for memory.
        
        valid_indices_map = {} # grid_index -> buffer_index
        current_buffer_index = 0
        
        # Color mapping (simple gradient usually done in frontend, but we'll do basic here)
        # Passing simple gradient: Low IV = Blue/Green, High IV = Red
        # Or just pass the normalized value as color and let frontend shader handle it? 
        # Frontend uses `vertexColors: true` and pushes colors.
        
        # Let's populate vertices
        num_points = len(ZI_flat)
        cols = grid_resolution_y # Y varies fastest in meshgrid default? 
        # meshgrid(xi, yi) -> XI rows are constant y (moneyness), cols are x (exp).
        # WAIT: np.meshgrid(xi, yi)
        # XI has shape (len(yi), len(xi)). 
        # XI[0] is first row (first yi). 
        # So XI varies along columns.
        rows = grid_resolution_y
        cols = grid_resolution_x
        
        for i in range(num_points):
            if np.isnan(ZI_flat[i]):
                continue
            
            # Map to 3D coords: X=Moneyness, Y=IV, Z=Expiration
            px = norm_Y_mon[i] # 0..1
            py = norm_Z_iv[i]  # 0..1
            pz = norm_X_exp[i] # 0..1
            
            positions.extend([px, py, pz])
            
            # simple color map: Red for high IV, Blue for low
            # Using a simple heatmap logic
            val = py # normalized IV
            # Simple R,G,B interpolation. 
            # Low (0): Blue (0,0,1)
            # Mid (0.5): Green (0,1,0)
            # High (1): Red (1,0,0)
            r, g, b = 0, 0, 0
            if val < 0.5:
                # Blue to Green
                t = val * 2
                r, g, b = 0, t, 1-t
            else:
                # Green to Red
                t = (val - 0.5) * 2
                r, g, b = t, 1-t, 0
                
            colors.extend([r, g, b])
            
            valid_indices_map[i] = current_buffer_index
            current_buffer_index += 1
            
        # Generate indices for triangles
        for r in range(rows - 1):
            for c in range(cols - 1):
                # Grid indices (flattened)
                # XI shape is (rows, cols)
                # index = r * cols + c
                idx1 = r * cols + c
                idx2 = r * cols + (c + 1)
                idx3 = (r + 1) * cols + c
                idx4 = (r + 1) * cols + (c + 1)
                
                # Check if all vertices are valid
                if (idx1 in valid_indices_map and idx2 in valid_indices_map and idx3 in valid_indices_map):
                     indices.extend([valid_indices_map[idx1], valid_indices_map[idx2], valid_indices_map[idx3]])
                     
                if (idx2 in valid_indices_map and idx4 in valid_indices_map and idx3 in valid_indices_map):
                     indices.extend([valid_indices_map[idx2], valid_indices_map[idx4], valid_indices_map[idx3]])

        # Raw points for tooltips (return all pruned points)
        # Format: [days, iv, moneyness, symbol, last, bid, ask, vol, oi]
        raw_points = pruneddf[desired_columns].fillna(0).values.tolist()
        
        return {
            "geometry": {
                "position": positions,
                "index": indices,
                "color": colors
            },
            "raw_points": raw_points,
            "timestamp": dt.now().isoformat()
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/")
async def health_check():
    return {"status": "ok"}


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host='0.0.0.0', port=port)