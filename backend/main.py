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
    all_options = pd.DataFrame()
    
    for date in options_dates:
        opt = ticker.option_chain(date)
        calls = opt.calls
        calls['Expiry'] = date
        calls['Type'] = 'Call'
        
        puts = opt.puts
        puts['Expiry'] = date
        puts['Type'] = 'Put'
        
        options = pd.concat([calls, puts])
        all_options = pd.concat([all_options, options])
    
    all_options['Date'] = dt.now().strftime('%Y-%m-%d')
    all_options['Expiry'] = pd.to_datetime(all_options['Expiry'])
    all_options['daysToExpiration'] = (all_options['Expiry'] - pd.to_datetime(all_options['Date'])).dt.days
    
    current_price = ticker.info['currentPrice']
    all_options["Moneyness"] = current_price / all_options["strike"]
    
    return all_options

@app.get('/options-data')
async def make_table(ticker: str = Query("META")):
    try:
        options = get_data(ticker)

        calls = options[options["Type"] == "Call"]
        
        focuseddf = calls[["daysToExpiration", "impliedVolatility", "Moneyness"]].dropna()

        print("Max IV before pruning:", focuseddf["impliedVolatility"].max())
        print("Min IV before pruning:", focuseddf["impliedVolatility"].min())
        
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
        data_points = pruneddf[[
            "daysToExpiration", 
            "impliedVolatility", 
            "Moneyness",
            "contractSymbol",
            "lastPrice",
            "bid",
            "ask",
            "volume",
            "openInterest"
        ]].fillna(0).values.tolist()
        
        return data_points

    except Exception as e:
        return {"error": str(e)}

if __name__ == '__main__':
    # Cloud Run provides the PORT env var. Default to 8080 for local dev.
    port = int(os.environ.get("PORT", 8080))
    # '0.0.0.0' tells Flask to listen on all available network interfaces
    app.run(host='0.0.0.0', port=port, debug=False)