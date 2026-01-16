from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import os
import uvicorn
import yfinance as yf
import pandas as pd
from datetime import datetime as dt

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
        pruneddf = focuseddf[
            (focuseddf["Moneyness"] >= (1 - strike_range)) &
            (focuseddf["Moneyness"] <= (1 + strike_range)) &
            (focuseddf["impliedVolatility"] <= 2) &
            (focuseddf['impliedVolatility'] >= 0.001) &
            (focuseddf['daysToExpiration'] <= 61)
        ].copy()
        
        # Each inner array has [x, y, z, ...]
        data_points = pruneddf[desired_columns].fillna(0).values.tolist()
        
        data_points = pruneddf[desired_columns].fillna(0).values.tolist()
        
        return {
            "data": data_points,
            "timestamp": dt.now().isoformat()
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port, debug=False)