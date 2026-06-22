import os
import sys
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

# Ensure UTF-8 output encoding to prevent Windows console UnicodeEncodeError/charmap issues
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# Import vnstock v4 APIs
from vnstock.api.quote import Quote
from vnstock.api.trading import Trading
from vnstock.api.company import Company
from vnstock.api.financial import Finance
from vnstock.api.listing import Listing

# Import Caching presets
from services.cache import (
    timed_cache,
    CACHE_TTL_REALTIME,
    CACHE_TTL_TECHNICAL,
    CACHE_TTL_FUNDAMENTAL,
    CACHE_TTL_SHAREHOLDERS
)

import socket

_has_internet = None

def is_internet_available() -> bool:
    global _has_internet
    if _has_internet is not None:
        return _has_internet
    try:
        # Quick check for internet connection
        socket.setdefaulttimeout(0.5)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("8.8.8.8", 53))
        s.close()
        _has_internet = True
    except Exception:
        _has_internet = False
    return _has_internet

@timed_cache(ttl_seconds=3600)
def get_symbols_map() -> dict:
    """Fetches and caches the mapping from symbol to organ_name."""
    if not is_internet_available():
        return {}
    try:
        df_symbols = Listing(source='VCI').all_symbols()
        if df_symbols is not None and not df_symbols.empty:
            return dict(zip(df_symbols['symbol'], df_symbols['organ_name']))
    except (Exception, SystemExit) as e:
        print(f"Error fetching symbols map: {e}")
    return {}

# Popular stocks for fallback (representing the complete VN30 basket)
POPULAR_STOCKS = {
    "ACB": {"base_price": 27000.0, "company": "Ngân hàng Á Châu (ACB)"},
    "BID": {"base_price": 48000.0, "company": "Ngân hàng BIDV"},
    "BSR": {"base_price": 22000.0, "company": "Lọc hóa dầu Bình Sơn (BSR)"},
    "CTG": {"base_price": 32000.0, "company": "Ngân hàng VietinBank"},
    "FPT": {"base_price": 130000.0, "company": "CTCP FPT"},
    "GAS": {"base_price": 80000.0, "company": "Tổng Công ty Khí Việt Nam (GAS)"},
    "GVR": {"base_price": 34000.0, "company": "Tập đoàn Công nghiệp Cao su Việt Nam"},
    "HDB": {"base_price": 24000.0, "company": "Ngân hàng HDBank"},
    "HPG": {"base_price": 28500.0, "company": "CTCP Tập đoàn Hòa Phát"},
    "LPB": {"base_price": 26000.0, "company": "Ngân hàng Lộc Phát Việt Nam"},
    "MBB": {"base_price": 23000.0, "company": "Ngân hàng Quân đội (MBB)"},
    "MSN": {"base_price": 75000.0, "company": "Tập đoàn Masan"},
    "MWG": {"base_price": 62000.0, "company": "CTCP Đầu tư Thế giới Di động"},
    "PLX": {"base_price": 38000.0, "company": "Tập đoàn Xăng dầu Việt Nam (Petrolimex)"},
    "SAB": {"base_price": 58000.0, "company": "Tổng CTCP Bia - Rượu - Nước giải khát Sài Gòn (Sabeco)"},
    "SHB": {"base_price": 11500.0, "company": "Ngân hàng SHB"},
    "SSB": {"base_price": 18000.0, "company": "Ngân hàng SeABank"},
    "SSI": {"base_price": 34000.0, "company": "CTCP Chứng khoán SSI"},
    "STB": {"base_price": 29000.0, "company": "Ngân hàng Sacombank"},
    "TCB": {"base_price": 47000.0, "company": "Ngân hàng Techcombank"},
    "TPB": {"base_price": 18500.0, "company": "Ngân hàng TPBank"},
    "VCB": {"base_price": 90000.0, "company": "Ngân hàng Vietcombank"},
    "VHM": {"base_price": 38000.0, "company": "CTCP Vinhomes"},
    "VIB": {"base_price": 21500.0, "company": "Ngân hàng Quốc tế VIB"},
    "VIC": {"base_price": 42000.0, "company": "Tập đoàn Vingroup"},
    "VJC": {"base_price": 105000.0, "company": "CTCP Hàng không Vietjet"},
    "VNM": {"base_price": 66000.0, "company": "CTCP Sữa Việt Nam"},
    "VPB": {"base_price": 19000.0, "company": "Ngân hàng VPBank"},
    "VPL": {"base_price": 55000.0, "company": "CTCP Vinpearl"},
    "VRE": {"base_price": 21000.0, "company": "CTCP Vincom Retail"}
}

# ============================================================
# Core Technical Indicators & FVG Calculations
# ============================================================

def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Calculates MA20, MA50, RSI, and Fair Value Gaps (FVG)."""
    df = df.copy()
    
    # Ensure numeric columns
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = df[col].astype(float)
        
    # Moving Averages & EMAs
    df['ma20'] = df['close'].rolling(window=20).mean()
    df['ma50'] = df['close'].rolling(window=50).mean()
    df['ema34'] = df['close'].ewm(span=34, adjust=False).mean()
    df['ema89'] = df['close'].ewm(span=89, adjust=False).mean()
    
    # RSI (14)
    delta = df['close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    avg_gain = gain.ewm(alpha=1/14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, adjust=False).mean()
    
    rs = avg_gain / (avg_loss + 1e-9)
    df['rsi'] = 100 - (100 / (1 + rs))
    
    # Fair Value Gaps (FVG)
    df['fvg_type'] = 0.0  # 1.0 for Bullish, -1.0 for Bearish, 0.0 for None
    df['fvg_top'] = np.nan
    df['fvg_bottom'] = np.nan
    
    if len(df) >= 3:
        highs = df['high'].values
        lows = df['low'].values
        
        fvg_types = np.zeros(len(df))
        fvg_tops = np.full(len(df), np.nan)
        fvg_bottoms = np.full(len(df), np.nan)
        
        for i in range(2, len(df)):
            # Bullish FVG: Low of candle 3 > High of candle 1
            if lows[i] > highs[i-2]:
                fvg_types[i] = 1.0
                fvg_tops[i] = lows[i]
                fvg_bottoms[i] = highs[i-2]
            # Bearish FVG: High of candle 3 < Low of candle 1
            elif highs[i] < lows[i-2]:
                fvg_types[i] = -1.0
                fvg_tops[i] = lows[i-2]
                fvg_bottoms[i] = highs[i]
                
        df['fvg_type'] = fvg_types
        df['fvg_top'] = fvg_tops
        df['fvg_bottom'] = fvg_bottoms
        
    return df

# ============================================================
# Mock Fallbacks (for offline/resilience)
# ============================================================

def generate_mock_history(symbol: str, days: int = 120) -> pd.DataFrame:
    """Generates realistic mock stock price historical data (OHLCV)."""
    symbol = symbol.upper()
    config = POPULAR_STOCKS.get(symbol, {"base_price": 50000.0, "company": f"Mã cổ phiếu {symbol}"})
    base_price = config["base_price"]
    
    end_date = datetime.now()
    dates = []
    current_date = end_date - timedelta(days=days * 1.5)
    
    while len(dates) < days:
        if current_date.weekday() < 5:
            dates.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(days=1)
        
    prices = [base_price]
    volatility = 0.02
    drift = 0.0005
    
    for _ in range(1, days):
        change_pct = random.normalvariate(drift, volatility)
        next_price = prices[-1] * (1 + change_pct)
        prices.append(max(next_price, 1000.0))
        
    data = []
    for i, date in enumerate(dates):
        close_p = prices[i]
        day_range = close_p * random.uniform(0.015, 0.04)
        high_p = max(close_p, prices[i-1] if i > 0 else close_p) + (day_range * random.uniform(0.1, 0.5))
        low_p = min(close_p, prices[i-1] if i > 0 else close_p) - (day_range * random.uniform(0.1, 0.5))
        open_p = random.uniform(low_p, high_p)
        
        high_p = max(high_p, open_p, close_p)
        low_p = min(low_p, open_p, close_p)
        volume = int(random.uniform(500000, 5000000))
        
        data.append({
            "date": date,
            "open": round(open_p, -1),
            "high": round(high_p, -1),
            "low": round(low_p, -1),
            "close": round(close_p, -1),
            "volume": volume
        })
        
    return pd.DataFrame(data)

def generate_mock_shareholders(symbol: str) -> list:
    """Generates realistic mock major shareholders list."""
    symbol = symbol.upper()
    if symbol == "FPT":
        return [
            {"name": "Trương Gia Bình (Chủ tịch HĐQT)", "shares": 117347966, "percentage": 6.89},
            {"name": "Tổng công ty Đầu tư và Kinh doanh vốn Nhà nước (SCIC)", "shares": 102500000, "percentage": 6.02},
            {"name": "Dragon Capital (Quỹ ngoại)", "shares": 85000000, "percentage": 4.99},
            {"name": "Bùi Quang Ngọc (Phó Chủ tịch HĐQT)", "shares": 35400000, "percentage": 2.08},
            {"name": "VinaCapital (Quỹ ngoại)", "shares": 51000000, "percentage": 3.00},
            {"name": "Fidelity Funds (Quỹ đầu tư)", "shares": 34000000, "percentage": 2.00}
        ]
    elif symbol == "HPG":
        return [
            {"name": "Trần Đình Long (Chủ tịch HĐQT)", "shares": 1516000000, "percentage": 26.08},
            {"name": "Vũ Thị Hiền (Vợ ông Trần Đình Long)", "shares": 400000000, "percentage": 6.88},
            {"name": "Dragon Capital (Quỹ ngoại)", "shares": 310000000, "percentage": 5.33},
            {"name": "VinaCapital (Quỹ ngoại)", "shares": 120000000, "percentage": 2.06},
            {"name": "Cổ đông nước ngoài khác", "shares": 870000000, "percentage": 14.97}
        ]
    elif symbol == "TCB":
        return [
            {"name": "Công ty Cổ phần Masan", "shares": 524000000, "percentage": 14.88},
            {"name": "Hồ Hùng Anh (Chủ tịch HĐQT)", "shares": 3930000, "percentage": 1.12},
            {"name": "Dragon Capital", "shares": 110000000, "percentage": 3.12},
            {"name": "Cổ đông nước ngoài (Room tối đa)", "shares": 776000000, "percentage": 22.00}
        ]
    else:
        return [
            {"name": "Ban điều hành & HĐQT", "shares": 12000000, "percentage": 5.40},
            {"name": "Tổng công ty Đầu tư SCIC", "shares": 22000000, "percentage": 9.90},
            {"name": "Dragon Capital VN", "shares": 11000000, "percentage": 4.95},
            {"name": "VinaCapital VN Opportunity", "shares": 7500000, "percentage": 3.37},
            {"name": "Quỹ Đầu Tư SSIAM", "shares": 5000000, "percentage": 2.25}
        ]

def generate_mock_foreign_flow(symbol: str) -> dict:
    """Generates realistic mock foreign buy/sell/net flow data over 10 sessions."""
    symbol = symbol.upper()
    random.seed(hash(symbol))
    
    base_buy = random.uniform(20.0, 80.0)
    if symbol == "FPT":
        base_buy = 65.5
    elif symbol == "HPG":
        base_buy = 110.2
    elif symbol == "VNM":
        base_buy = 45.8
    elif symbol == "TCB":
        base_buy = 55.4
        
    history = []
    current_date = datetime.now()
    days_generated = 0
    
    while days_generated < 10:
        test_date = current_date - timedelta(days=len(history))
        if test_date.weekday() < 5:
            date_str = test_date.strftime("%Y-%m-%d")
            buy_val = round(base_buy * random.uniform(0.7, 1.4), 2)
            sell_val = round(base_buy * random.uniform(0.6, 1.3), 2)
            
            if symbol == "FPT":
                net_val = round(buy_val - sell_val + random.uniform(5.0, 15.0), 2)
                buy_val = round(sell_val + net_val, 2)
            elif symbol in ["VIC", "VHM"]:
                net_val = round(buy_val - sell_val - random.uniform(10.0, 25.0), 2)
                sell_val = round(buy_val - net_val, 2)
            else:
                net_val = round(buy_val - sell_val, 2)
                
            history.append({
                "date": date_str,
                "buy_value": buy_val,
                "sell_value": sell_val,
                "net_value": net_val
            })
            days_generated += 1
        else:
            current_date -= timedelta(days=1)
            
    return {
        "latest": history[0],
        "history": history
    }

def generate_mock_fundamental(symbol: str) -> dict:
    """Generates realistic financial ratios and statements."""
    symbol = symbol.upper()
    config = POPULAR_STOCKS.get(symbol, {"base_price": 50000.0, "company": f"Mã cổ phiếu {symbol}"})
    
    if symbol == "FPT":
        pe, pb, roe, roa = 22.4, 5.8, 27.2, 11.5
        financials = [
            {"period": "2025", "revenue": 62500.0, "net_profit": 7800.0, "assets": 65000.0, "equity": 32000.0},
            {"period": "2024", "revenue": 52600.0, "net_profit": 6480.0, "assets": 58000.0, "equity": 28000.0},
            {"period": "2023", "revenue": 45100.0, "net_profit": 5500.0, "assets": 49000.0, "equity": 24000.0}
        ]
    elif symbol == "HPG":
        pe, pb, roe, roa = 14.2, 1.6, 12.5, 7.2
        financials = [
            {"period": "2025", "revenue": 145000.0, "net_profit": 11800.0, "assets": 195000.0, "equity": 110000.0},
            {"period": "2024", "revenue": 128000.0, "net_profit": 8900.0, "assets": 180000.0, "equity": 98000.0},
            {"period": "2023", "revenue": 115000.0, "net_profit": 6800.0, "assets": 170000.0, "equity": 92000.0}
        ]
    else:
        is_bank = symbol in ["TCB", "STB", "MBB", "ACB", "BID", "CTG", "HDB", "LPB", "SHB", "SSB", "TPB", "VCB", "VIB", "VPB"]
        pe = round(random.uniform(7.0, 11.0) if is_bank else random.uniform(12.0, 18.0), 2)
        pb = round(random.uniform(0.9, 1.5) if is_bank else random.uniform(1.8, 3.5), 2)
        roe = round(random.uniform(14.0, 20.0), 2)
        roa = round(random.uniform(1.5, 2.8) if is_bank else random.uniform(6.0, 12.0), 2)
        
        base_rev = (config["base_price"] * random.uniform(0.5, 1.5)) / 10.0
        financials = []
        for i, year in enumerate(["2025", "2024", "2023"]):
            factor = 1.0 - (i * 0.15)
            rev = round(base_rev * factor, 1)
            np = round(rev * (random.uniform(0.35, 0.48) if is_bank else random.uniform(0.08, 0.15)), 1)
            eq = round(base_rev * random.uniform(3.0, 5.0) * factor, 1)
            assets = round(eq * (random.uniform(6.0, 8.0) if is_bank else random.uniform(1.5, 2.2)), 1)
            financials.append({
                "period": year,
                "revenue": rev,
                "net_profit": np,
                "assets": assets,
                "equity": eq
            })
            
    return {
        "pe": pe,
        "pb": pb,
        "roe": roe,
        "roa": roa,
        "financials": financials
    }

# ============================================================
# Helpers for Index Calculations
# ============================================================

def get_index_data(symbol: str) -> dict:
    """Fetches real-time price & change calculations for market index."""
    try:
        q = Quote(symbol=symbol, source='VCI')
        end_dt = datetime.now()
        start_dt = end_dt - timedelta(days=8)
        df = q.history(start=start_dt.strftime("%Y-%m-%d"), end=end_dt.strftime("%Y-%m-%d"))
        if df is not None and not df.empty and len(df) >= 2:
            df = df.sort_values('time')
            latest_val = float(df['close'].iloc[-1])
            prev_val = float(df['close'].iloc[-2])
            change = round(latest_val - prev_val, 2)
            change_percent = round((change / prev_val) * 100, 2) if prev_val != 0 else 0.0
            return {
                "name": "HNX-INDEX" if symbol == "HNXINDEX" else symbol,
                "value": round(latest_val, 2),
                "change": change,
                "change_percent": change_percent
            }
    except (Exception, SystemExit) as e:
        print(f"Error fetching index {symbol} via vnstock: {e}")
        
    # Standard Fallback values
    fallback_map = {
        "VNINDEX": {"value": 1282.40, "change": 12.50, "change_percent": 0.98},
        "VN30": {"value": 1312.10, "change": 14.80, "change_percent": 1.14},
        "HNXINDEX": {"value": 245.30, "change": -1.20, "change_percent": -0.49}
    }
    fb = fallback_map.get(symbol, {"value": 1000.0, "change": 0.0, "change_percent": 0.0})
    return {
        "name": "HNX-INDEX" if symbol == "HNXINDEX" else symbol,
        "value": fb["value"],
        "change": fb["change"],
        "change_percent": fb["change_percent"]
    }

# ============================================================
# Main Service Endpoints & Real-time Integrations
# ============================================================

@timed_cache(ttl_seconds=CACHE_TTL_REALTIME)
def get_realtime_data() -> dict:
    """
    1. DỮ LIỆU THỰC TẾ (Real-time):
    Fetches VN-INDEX, VN30, HNX-INDEX; calculates market breadth, liquidity, and
    highlighted gainers/losers based on VN100 basket via vnstock v4.
    """
    # 1. Fetch indices
    indexes = [
        get_index_data("VNINDEX"),
        get_index_data("VN30"),
        get_index_data("HNXINDEX")
    ]
    
    # Default outputs if next steps fail
    breadth = {"rising": 60, "flat": 15, "falling": 25}
    liquidity = 15200.0
    top_gainers = [
        {"symbol": "FPT", "price": 135000.0, "change_percent": 6.8},
        {"symbol": "SSI", "price": 36200.0, "change_percent": 5.4},
        {"symbol": "TCB", "price": 49200.0, "change_percent": 4.6}
    ]
    top_losers = [
        {"symbol": "VIC", "price": 40800.0, "change_percent": -3.2},
        {"symbol": "VHM", "price": 37100.0, "change_percent": -2.5},
        {"symbol": "VNM", "price": 64800.0, "change_percent": -1.8}
    ]
    
    try:
        # 2. Get VN100 list
        l = Listing(source='VCI')
        vn100_series = l.symbols_by_group('VN100')
        if vn100_series is not None and not vn100_series.empty:
            vn100_symbols = vn100_series.tolist()
            
            # 3. Get price board for VN100
            t = Trading(symbol='TCB', source='VCI')
            df = t.price_board(symbols_list=vn100_symbols)
            if df is not None and not df.empty:
                df.columns = ['_'.join(col).strip() if isinstance(col, tuple) else col for col in df.columns]
                df = df.reset_index()
                
                symbols_map = get_symbols_map()
                
                rising, flat, falling = 0, 0, 0
                total_val = 0.0
                candidates = []
                
                for idx in range(len(df)):
                    row = df.iloc[idx]
                        
                    sym = row.get('listing_symbol')
                    if not sym:
                        continue
                        
                    match_p = row.get('match_match_price')
                    ref_p = row.get('match_reference_price')
                    accum_val = row.get('match_accumulated_value')
                    
                    price = float(match_p) if match_p is not None else 0.0
                    ref = float(ref_p) if ref_p is not None else 0.0
                    
                    # Ensure price is valid
                    if price <= 0:
                        price = ref
                        
                    if price > 0 and ref > 0:
                        change = price - ref
                        chg_pct = round((change / ref) * 100, 2)
                        
                        if price > ref:
                            rising += 1
                        elif price < ref:
                            falling += 1
                        else:
                            flat += 1
                            
                        comp_name = symbols_map.get(str(sym), POPULAR_STOCKS.get(str(sym), {}).get("company", f"Công ty {sym}"))
                        candidates.append({
                            "symbol": str(sym),
                            "company_name": comp_name,
                            "price": price,
                            "change_percent": chg_pct
                        })
                        
                    if accum_val is not None:
                        total_val += float(accum_val)
                        
                if rising + flat + falling > 0:
                    breadth = {"rising": rising, "flat": flat, "falling": falling}
                if total_val > 0:
                    # accumulated_value is in million VND, scale to billion VND
                    liquidity = round(total_val / 1000.0, 1)
                    
                # Highlight gainers/losers
                if candidates:
                    # Sort by change percent
                    sorted_gainers = sorted(candidates, key=lambda x: x["change_percent"], reverse=True)
                    sorted_losers = sorted(candidates, key=lambda x: x["change_percent"])
                    
                    top_gainers = sorted_gainers[:3]
                    top_losers = sorted_losers[:3]
                    
    except (Exception, SystemExit) as e:
        print(f"Error computing real-time VN100 market overview: {e}")
        
    return {
        "indexes": indexes,
        "liquidity": liquidity,
        "market_breadth": breadth,
        "top_gainers": top_gainers,
        "top_losers": top_losers
    }


@timed_cache(ttl_seconds=CACHE_TTL_TECHNICAL)
def get_stock_history_internal(symbol: str) -> list:
    """Fetches stock historical data (6 months) and calculates indicators."""
    symbol = symbol.upper()
    df = None
    
    try:
        q = Quote(symbol=symbol, source='VCI')
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")
        
        df = q.history(start=start_date, end=end_date)
        if df is not None and not df.empty:
            df = df.rename(columns={
                'Time': 'date', 'Open': 'open', 'High': 'high',
                'Low': 'low', 'Close': 'close', 'Volume': 'volume',
                'time': 'date'
            })
    except (Exception, SystemExit) as e:
        print(f"Error fetching historical data for {symbol} via vnstock: {e}")
        df = None
        
    if df is None or df.empty:
        df = generate_mock_history(symbol)
        
    df = calculate_indicators(df)
    df_clean = df.replace({np.nan: None})
    return df_clean.to_dict(orient='records')


@timed_cache(ttl_seconds=CACHE_TTL_FUNDAMENTAL)
def get_stock_fundamental_internal(symbol: str) -> dict:
    """Fetches financial ratios and BCTC via vnstock Finance API."""
    symbol = symbol.upper()
    data = None
    
    try:
        f = Finance(symbol=symbol, source='VCI')
        ratio_df = f.ratio()
        is_df = f.income_statement(period='year')
        bs_df = f.balance_sheet(period='year')
        
        pe, pb, roe, roa = None, None, None, None
        
        if ratio_df is not None and not ratio_df.empty:
            period_cols = [c for c in ratio_df.columns if c not in ['item', 'item_en', 'item_id']]
            latest_col = period_cols[-1] if period_cols else None
            
            if latest_col:
                for _, row in ratio_df.iterrows():
                    item_name = str(row.get('item', '')).lower()
                    item_id = str(row.get('item_id', '')).lower()
                    val = row.get(latest_col)
                    if not pd.isna(val):
                        try:
                            val = float(val)
                            if "p/e" in item_name or "pe" == item_id or "pe_ratio" == item_id:
                                pe = val
                            elif "p/b" in item_name or "pb" == item_id or "pb_ratio" == item_id:
                                pb = val
                            elif "roe" in item_name or "roe" in item_id:
                                roe = val * 100.0 if abs(val) < 1.0 else val
                            elif "roa" in item_name or "roa" in item_id:
                                roa = val * 100.0 if abs(val) < 1.0 else val
                        except (ValueError, TypeError):
                            pass
                            
        # Annual financials
        financials = []
        if is_df is not None and not is_df.empty:
            year_cols = [c for c in is_df.columns if c not in ['item', 'item_en', 'item_id'] and c.isdigit()]
            year_cols = sorted(year_cols, reverse=True)[:3]
            
            is_df_unique = is_df.drop_duplicates(subset=['item_id']) if 'item_id' in is_df.columns else is_df
            is_dict = is_df_unique.set_index('item_id').to_dict(orient='index') if 'item_id' in is_df_unique.columns else {}
            if not is_dict and 'item' in is_df.columns:
                is_df_unique_item = is_df.drop_duplicates(subset=['item'])
                is_dict = is_df_unique_item.set_index('item').to_dict(orient='index')
                
            bs_df_unique = bs_df.drop_duplicates(subset=['item_id']) if bs_df is not None and not bs_df.empty and 'item_id' in bs_df.columns else bs_df
            bs_dict = bs_df_unique.set_index('item_id').to_dict(orient='index') if bs_df_unique is not None and not bs_df_unique.empty and 'item_id' in bs_df_unique.columns else {}
            if not bs_dict and bs_df is not None and not bs_df.empty and 'item' in bs_df.columns:
                bs_df_unique_item = bs_df.drop_duplicates(subset=['item'])
                bs_dict = bs_df_unique_item.set_index('item').to_dict(orient='index')
                
            # Improved robust key selection
            rev_key = next((k for k in is_dict.keys() if str(k).lower() in ['net_sales', 'sales', 'total_operating_income', 'net_interest_income']), None)
            if not rev_key:
                rev_key = next((k for k in is_dict.keys() if any(x in str(k).lower() for x in ['revenue', 'doanh thu', 'sales', 'operating_income', 'total_operating_income'])), None)

            np_key = next((k for k in is_dict.keys() if str(k).lower() == 'net_profit_loss_after_tax'), None)
            if not np_key:
                np_key = next((k for k in is_dict.keys() if 'profit_after_tax' in str(k).lower() or 'sau thuế' in str(k).lower() or 'sau thu' in str(k).lower()), None)

            asset_key = next((k for k in bs_dict.keys() if str(k).lower() == 'total_assets'), None)
            if not asset_key:
                asset_key = next((k for k in bs_dict.keys() if 'total_assets' in str(k).lower() or 'tong_tai_san' in str(k).lower() or 'tổng tài sản' in str(k).lower()), None)
            if not asset_key:
                asset_key = next((k for k in bs_dict.keys() if 'assets' in str(k).lower() or 'tài sản' in str(k).lower() or 'ti sn' in str(k).lower()), None)

            eq_key = next((k for k in bs_dict.keys() if str(k).lower() == 'owners_equity'), None)
            if not eq_key:
                eq_key = next((k for k in bs_dict.keys() if 'owner_equity' in str(k).lower() or 'owners_equity' in str(k).lower() or 'vốn chủ' in str(k).lower() or 'vn ch' in str(k).lower()), None)
            if not eq_key:
                eq_key = next((k for k in bs_dict.keys() if 'equity' in str(k).lower()), None)
            
            for year in year_cols:
                rev_val = is_dict[rev_key].get(year) if rev_key else None
                np_val = is_dict[np_key].get(year) if np_key else None
                asset_val = bs_dict[asset_key].get(year) if asset_key else None
                eq_val = bs_dict[eq_key].get(year) if eq_key else None
                
                def to_billion(val):
                    if val is None or pd.isna(val):
                        return None
                    try:
                        v_float = float(val)
                        if v_float > 1e6:
                            return round(v_float / 1e9, 1)
                        return round(v_float, 1)
                    except Exception:
                        return None
                        
                financials.append({
                    "period": year,
                    "revenue": to_billion(rev_val),
                    "net_profit": to_billion(np_val),
                    "assets": to_billion(asset_val),
                    "equity": to_billion(eq_val)
                })
                
        if pe is not None or pb is not None or financials:
            data = {
                "pe": pe,
                "pb": pb,
                "roe": roe,
                "roa": roa,
                "financials": financials
            }
    except (Exception, SystemExit) as e:
        safe_err = str(e).encode('ascii', 'ignore').decode('ascii')
        print(f"Error fetching fundamentals for {symbol} via vnstock: {safe_err}")
        data = None
        
    if not data:
        data = generate_mock_fundamental(symbol)
    return data


@timed_cache(ttl_seconds=CACHE_TTL_SHAREHOLDERS)
def get_shareholders_internal(symbol: str) -> list:
    """Fetches list of major shareholders using vnstock Company module."""
    symbol = symbol.upper()
    data = None
    
    try:
        c = Company(symbol=symbol, source='VCI')
        df = c.shareholders()
        if df is not None and not df.empty:
            data = []
            names_seen = set()
            for _, row in df.iterrows():
                name = str(row.get('share_holder', '')).strip()
                if not name:
                    continue
                pct = row.get('share_own_percent', 0.0)
                shares = row.get('quantity', 0)
                
                if pd.isna(pct):
                    pct = 0.0
                if pd.isna(shares):
                    shares = 0
                else:
                    shares = int(shares)
                    
                pct_val = float(pct)
                if pct_val < 1.0:
                    pct_val = pct_val * 100.0
                    
                data.append({
                    "name": name,
                    "shares": shares,
                    "percentage": round(pct_val, 2)
                })
                names_seen.add(name.lower())
                
            if len(data) < 3:
                mock_items = generate_mock_shareholders(symbol)
                for item in mock_items:
                    if item["name"].lower() not in names_seen:
                        data.append(item)
    except (Exception, SystemExit) as e:
        print(f"Error fetching shareholders for {symbol} via vnstock: {e}")
        data = None
        
    if not data:
        data = generate_mock_shareholders(symbol)
    return data


@timed_cache(ttl_seconds=CACHE_TTL_REALTIME)
def get_foreign_flow_internal(symbol: str) -> dict:
    """Fetches foreign transaction flow: latest session via price_board, 10-day history fallback."""
    symbol = symbol.upper()
    
    # 1. Start with 10 sessions of realistic flow
    mock_flow = generate_mock_foreign_flow(symbol)
    
    # 2. Try to query real-time latest session values from VCI price board
    try:
        t = Trading(symbol=symbol, source='VCI')
        df = t.price_board(symbols_list=[symbol])
        if df is not None and not df.empty:
            row = df.iloc[0]
            
            def get_row_val(col_tuple):
                if col_tuple in row:
                    return row[col_tuple]
                if col_tuple[1] in row:
                    return row[col_tuple[1]]
                return 0.0
                
            buy_raw = get_row_val(('match', 'foreign_buy_value'))
            sell_raw = get_row_val(('match', 'foreign_sell_value'))
            
            # Values in price_board are in VND, convert to billion VND
            buy_val = round(float(buy_raw) / 1e9, 2) if buy_raw else 0.0
            sell_val = round(float(sell_raw) / 1e9, 2) if sell_raw else 0.0
            net_val = round(buy_val - sell_val, 2)
            
            # Override latest session with real-time price board metrics
            realtime_latest = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "buy_value": buy_val,
                "sell_value": sell_val,
                "net_value": net_val
            }
            mock_flow["latest"] = realtime_latest
            mock_flow["history"][0] = realtime_latest
    except (Exception, SystemExit) as e:
        print(f"Error overriding foreign flow for {symbol} using price_board: {e}")
        
    return mock_flow


def get_stock_full_analysis(symbol: str) -> dict:
    """
    2. DỮ LIỆU LỊCH SỬ & PHÂN TÍCH (Historical & Analysis):
    Aggregates technical history, fair value gaps, ratios, shareholders, and
    foreign flow into a single unified analytical payload.
    """
    symbol = symbol.upper()
    symbols_map = get_symbols_map()
    company_name = symbols_map.get(symbol, POPULAR_STOCKS.get(symbol, {}).get("company", f"Công ty {symbol}"))

    try:
        t = Trading(symbol=symbol, source='VCI')
        df_board = t.price_board(symbols_list=[symbol])
        if df_board is not None and not df_board.empty:
            df_board.columns = ['_'.join(col).strip() if isinstance(col, tuple) else col for col in df_board.columns]
            df_board = df_board.reset_index()
            row = df_board.iloc[0]
            
            match_p = row.get('match_match_price')
            ref_p = row.get('match_reference_price')
            ceil_p = row.get('match_ceiling_price') or row.get('listing_ceiling')
            floor_p = row.get('match_floor_price') or row.get('listing_floor')
            
            price = float(match_p) if match_p is not None else 0.0
            ref = float(ref_p) if ref_p is not None else 0.0
            ceiling = float(ceil_p) if ceil_p is not None else 0.0
            floor = float(floor_p) if floor_p is not None else 0.0
            
            if price <= 0:
                price = ref
            change_percent = round(((price - ref) / ref) * 100, 2) if ref > 0 else 0.0
        else:
            price = POPULAR_STOCKS.get(symbol, {}).get("base_price", 0.0)
            change_percent = 0.0
            ref = price
            ceiling = round(price * 1.07)
            floor = round(price * 0.93)
    except (Exception, SystemExit) as e:
        print(f"Error fetching real-time price for {symbol}: {e}")
        price = POPULAR_STOCKS.get(symbol, {}).get("base_price", 0.0)
        change_percent = 0.0
        ref = price
        ceiling = round(price * 1.07)
        floor = round(price * 0.93)

    return {
        "symbol": symbol,
        "company_name": company_name,
        "price": price,
        "change_percent": change_percent,
        "ref_price": ref,
        "ceiling_price": ceiling,
        "floor_price": floor,
        "history": get_stock_history_internal(symbol),
        "fundamentals": get_stock_fundamental_internal(symbol),
        "shareholders": get_shareholders_internal(symbol),
        "foreign_flow": get_foreign_flow_internal(symbol)
    }

# ============================================================
# API Backwards-Compatible Helpers
# ============================================================

def get_market_overview_data() -> dict:
    """Redirects to the new get_realtime_data() implementation."""
    return get_realtime_data()

def get_stock_history(symbol: str) -> list:
    """Gets technical history."""
    return get_stock_history_internal(symbol)

def get_stock_fundamental(symbol: str) -> dict:
    """Gets fundamentals."""
    return get_stock_fundamental_internal(symbol)

def get_shareholders(symbol: str) -> list:
    """Gets shareholders."""
    return get_shareholders_internal(symbol)

def get_foreign_flow(symbol: str) -> dict:
    """Gets foreign flow."""
    return get_foreign_flow_internal(symbol)

@timed_cache(ttl_seconds=CACHE_TTL_TECHNICAL)
def get_screener_data() -> list:
    """Scans popular stocks and returns indicator signal summaries using real technical data."""
    results = []
    
    # Dynamically fetch VN30 symbols list
    vn30_symbols = []
    try:
        if is_internet_available():
            l = Listing(source='VCI')
            vn30_series = l.symbols_by_group('VN30')
            if vn30_series is not None and not vn30_series.empty:
                vn30_symbols = vn30_series.tolist()
    except (Exception, SystemExit) as e:
        print(f"Error fetching dynamic VN30 list: {e}")
        
    if not vn30_symbols:
        vn30_symbols = list(POPULAR_STOCKS.keys())
        
    symbols_map = get_symbols_map()
    
    for symbol in vn30_symbols:
        symbol = symbol.upper()
        info = POPULAR_STOCKS.get(symbol, {"company": f"Công ty {symbol}"})
        company_name = symbols_map.get(symbol, info["company"])
        
        try:
            history = get_stock_history_internal(symbol)
            if not history or len(history) < 2:
                continue
                
            latest = history[-1]
            prev = history[-2]
            
            price = latest['close']
            change = price - prev['close']
            chg_pct = round((change / prev['close']) * 100, 2) if prev['close'] != 0 else 0.0
            
            rsi = latest.get('rsi')
            ma20 = latest.get('ma20')
            ma50 = latest.get('ma50')
            
            trend = "Sideways"
            if ma20 and ma50:
                if price > ma20 > ma50:
                    trend = "Bullish"
                elif price < ma20 < ma50:
                    trend = "Bearish"
                    
            rsi_status = "Neutral"
            if rsi:
                if rsi >= 70:
                    rsi_status = "Overbought"
                elif rsi <= 30:
                    rsi_status = "Oversold"
                    
            fvg_signal = "None"
            for i in range(-1, -6, -1):
                if abs(i) <= len(history):
                    day_data = history[i]
                    if day_data.get('fvg_type') == 1.0:
                        fvg_signal = "Bullish FVG"
                        break
                    elif day_data.get('fvg_type') == -1.0:
                        fvg_signal = "Bearish FVG"
                        break
                        
            results.append({
                "symbol": symbol,
                "name": company_name,
                "price": price,
                "change": round(change, -1),
                "change_percent": chg_pct,
                "rsi": round(rsi, 2) if rsi else None,
                "rsi_status": rsi_status,
                "ma20": round(ma20, -1) if ma20 else None,
                "ma50": round(ma50, -1) if ma50 else None,
                "trend": trend,
                "fvg_signal": fvg_signal,
                "volume": latest['volume']
            })
        except (Exception, SystemExit) as e:
            print(f"Error screening symbol {symbol}: {e}")
    return results

def get_market_news() -> list:
    """Tin tức vĩ mô (tĩnh)."""
    # Keep newsheadlines intact as defined previously
    news = [
        {
            "title": "Xu hướng dòng vốn ngoại: Khối ngoại quay lại mua ròng mạnh các mã Bluechips",
            "source": "CafeF",
            "time": "15 phút trước",
            "summary": "Sau chuỗi ngày bán ròng liên tiếp, dòng vốn ngoại bắt đầu có tín hiệu đảo chiều tích cực khi giải ngân mạnh vào nhóm VN30 như FPT, HPG và TCB.",
            "link": "#"
        },
        {
            "title": "Doanh thu xuất khẩu phần mềm của các doanh nghiệp công nghệ Việt Nam tăng trưởng vượt kỳ vọng",
            "source": "Vietstock",
            "time": "45 phút trước",
            "summary": "Thống kê sơ bộ từ Hiệp hội CNTT cho thấy kim ngạch xuất khẩu phần mềm sang thị trường Nhật Bản và Mỹ trong 5 tháng đầu năm tăng hơn 25% so với cùng kỳ.",
            "link": "#"
        },
        {
            "title": "Ngân hàng Nhà nước tiếp tục duy trì chính sách tiền tệ nới lỏng nhằm hỗ trợ phục hồi kinh tế",
            "source": "VnExpress",
            "time": "2 giờ trước",
            "summary": "Lãi suất điều hành tiếp tục được giữ ở mức thấp ổn định, tạo điều kiện thuận lợi cho các doanh nghiệp tiếp cận nguồn vốn giá rẻ phục vụ sản xuất kinh doanh.",
            "link": "#"
        },
        {
            "title": "Nhóm cổ phiếu Thép bứt phá mạnh mẽ nhờ giá thép thế giới phục hồi ổn định",
            "source": "Tin Nhanh Chứng Khoán",
            "time": "4 giờ trước",
            "summary": "Giá thép cuộn cán nóng HRC tăng nhẹ trên thị trường quốc tế là động lực thúc đẩy đà tăng trưởng của các cổ phiếu HPG, HSG và NKG trong các phiên gần đây.",
            "link": "#"
        },
        {
            "title": "Báo cáo phân tích kỹ thuật VN-Index: Kiểm định lại ngưỡng kháng cự tâm lý 1.300 điểm",
            "source": "Rồng Việt",
            "time": "6 giờ trước",
            "summary": "Nhận định xu hướng kỹ thuật cho thấy chỉ số đang tích lũy tốt trên đường MA20, có khả năng sẽ bứt phá kiểm thử mốc kháng cự mạnh trong tuần tới.",
            "link": "#"
        }
    ]
    return news
