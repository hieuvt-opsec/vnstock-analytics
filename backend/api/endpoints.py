from fastapi import APIRouter, HTTPException
from services.stock_service import (
    get_market_overview_data,
    get_screener_data,
    get_stock_history,
    get_stock_fundamental,
    get_market_news,
    get_foreign_flow,
    get_shareholders,
    get_stock_full_analysis
)
from services.cache import clear_cache, get_cache_stats

router = APIRouter(prefix="/api")

@router.get("/market-overview")
async def market_overview():
    """Returns general overview of the Vietnamese stock market."""
    try:
        return get_market_overview_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting market overview: {str(e)}")

@router.get("/stock-screener")
async def stock_screener():
    """Scans popular symbols and filters them based on technical indicators."""
    try:
        return get_screener_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running stock screener: {str(e)}")

@router.get("/stock-analysis/{symbol}")
async def stock_analysis(symbol: str):
    """Returns historical OHLC price data with calculated technical indicators."""
    try:
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ.")
        full_analysis = get_stock_full_analysis(symbol)
        if not full_analysis or not full_analysis.get("history"):
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu cho mã {symbol.upper()}")
        return full_analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing stock {symbol}: {str(e)}")

@router.get("/stock-fundamental/{symbol}")
async def stock_fundamental(symbol: str):
    """Returns fundamental ratios and summary financials."""
    try:
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ.")
        full_analysis = get_stock_full_analysis(symbol)
        data = full_analysis.get("fundamentals")
        if not data:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu cơ bản cho mã {symbol.upper()}")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading fundamentals for {symbol}: {str(e)}")

@router.get("/market-news")
async def market_news():
    """Returns the latest Vietnamese stock market news articles."""
    try:
        return get_market_news()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading market news: {str(e)}")

@router.get("/stock-foreign/{symbol}")
async def stock_foreign(symbol: str):
    """Returns foreign investor transaction flow history."""
    try:
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ.")
        full_analysis = get_stock_full_analysis(symbol)
        data = full_analysis.get("foreign_flow")
        if not data:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu khối ngoại cho mã {symbol.upper()}")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading foreign flow for {symbol}: {str(e)}")

@router.get("/stock-shareholders/{symbol}")
async def stock_shareholders(symbol: str):
    """Returns the list of major shareholders."""
    try:
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ.")
        full_analysis = get_stock_full_analysis(symbol)
        data = full_analysis.get("shareholders")
        if not data:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu cổ đông cho mã {symbol.upper()}")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading shareholders for {symbol}: {str(e)}")

@router.get("/clear-cache")
async def clear_api_cache():
    """Purges all entries from the memory cache."""
    try:
        pre_stats = get_cache_stats()
        cleared_count = clear_cache()
        post_stats = get_cache_stats()
        return {"status": "success", "message": f"Cleared {cleared_count} entries.", "before": pre_stats, "after": post_stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing cache: {str(e)}")


@router.get("/stock/detail")
async def stock_detail(symbol: str):
    """
    Pure-data endpoint for Dynamic Dashboard.
    Returns company profile, real-time price, fundamentals, financials, and raw history.
    """
    try:
        symbol = symbol.upper().strip()
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ.")

        full_analysis = get_stock_full_analysis(symbol)
        if not full_analysis or not full_analysis.get("history"):
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu cho mã {symbol}")

        fundamentals = full_analysis.get("fundamentals", {})
        price = full_analysis.get("price", 0.0)
        change_percent = full_analysis.get("change_percent", 0.0)
        company_name = full_analysis.get("company_name", f"Công ty {symbol}")
        history = full_analysis.get("history", [])

        pe = fundamentals.get("pe")
        pb = fundamentals.get("pb")
        roe = fundamentals.get("roe")
        roa = fundamentals.get("roa")
        financials = fundamentals.get("financials", [])

        bvps = round(price / pb, 1) if pb and pb > 0 and price else None
        eps = round(price / pe, 1) if pe and pe > 0 and price else None
        lnst = financials[0].get("net_profit") if financials else None
        volume = history[-1].get("volume") if history else None

        volume_formatted = "N/A"
        if volume:
            if volume >= 1_000_000:
                volume_formatted = f"{volume / 1_000_000:.2f}M CP"
            elif volume >= 1_000:
                volume_formatted = f"{volume / 1_000:.1f}K CP"
            else:
                volume_formatted = f"{volume} CP"

        # Fetch Market Cap, Sector, Exchange from Company overview
        market_cap_billion, sector, exchange = None, None, None
        try:
            import pandas as pd
            from vnstock.api.company import Company
            comp = Company(symbol=symbol, source='VCI')
            overview_df = comp.overview()
            if overview_df is not None and not overview_df.empty:
                row = overview_df.iloc[0]
                mcap = row.get('market_cap')
                if mcap and not pd.isna(mcap):
                    market_cap_billion = round(float(mcap) / 1e9, 1)
                sect = row.get('sector')
                if sect and not pd.isna(sect):
                    sector_map = {
                        "Basic Resources": "Tài nguyên Cơ bản", "Banks": "Ngân hàng",
                        "Financial Services": "Dịch vụ Tài chính", "Real Estate": "Bất động sản",
                        "Food & Beverage": "Thực phẩm & Đồ uống", "Technology": "Công nghệ",
                        "Utilities": "Tiện ích Công cộng", "Oil & Gas": "Dầu khí",
                        "Retail": "Bán lẻ", "Construction & Materials": "Xây dựng & Vật liệu",
                        "Chemicals": "Hóa chất", "Telecommunications": "Viễn thông",
                        "Insurance": "Bảo hiểm", "Healthcare": "Y tế"
                    }
                    sector = sector_map.get(str(sect).strip(), str(sect).strip())
                exch = row.get('exchange')
                if exch and not pd.isna(exch):
                    exchange = str(exch).strip().upper()
        except Exception as e:
            print(f"Error fetching company overview for {symbol}: {e}")

        # Fallback values
        if not market_cap_billion:
            fb_caps = {"FPT": 178500.0, "HPG": 199254.0, "TCB": 165000.0, "VCB": 500000.0, "VNM": 138000.0}
            market_cap_billion = fb_caps.get(symbol, round(price * 0.1, 1))
        if not sector:
            fb_sec = {"FPT": "Công nghệ", "HPG": "Tài nguyên Cơ bản", "TCB": "Ngân hàng", "VCB": "Ngân hàng", "VNM": "Thực phẩm & Đồ uống", "MWG": "Bán lẻ", "SSI": "Dịch vụ Tài chính"}
            sector = fb_sec.get(symbol, "Thương mại & Dịch vụ")
        if not exchange:
            upcom = ['BSR', 'CTR', 'VGI', 'MCH', 'VEA', 'ACV']
            hnx = ['SHS', 'PVS', 'IDC', 'CEO', 'MBS', 'DTD', 'TNG']
            exchange = 'UPCOM' if symbol in upcom else ('HNX' if symbol in hnx else 'HOSE')

        ref_price = full_analysis.get("ref_price", price)
        ceiling_price = full_analysis.get("ceiling_price", price * 1.07)
        floor_price = full_analysis.get("floor_price", price * 0.93)

        # Extract EMA34 & EMA89 from the latest history item and scale to match current price format
        price_scale = 1
        if history and price:
            last_close = history[-1].get("close")
            if last_close and price / last_close > 100:
                price_scale = round(price / last_close)

        latest_history = history[-1] if history else {}
        ema34 = latest_history.get('ema34')
        ema89 = latest_history.get('ema89')

        if ema34 is not None and price_scale > 1:
            ema34 = round(ema34 * price_scale, 2)
        if ema89 is not None and price_scale > 1:
            ema89 = round(ema89 * price_scale, 2)

        return {
            "symbol": symbol, "company_name": company_name, "exchange": exchange,
            "sector": sector, "price": price, "change_percent": change_percent,
            "ref_price": ref_price, "ceiling_price": ceiling_price, "floor_price": floor_price,
            "market_cap": market_cap_billion, "volume": volume, "volume_formatted": volume_formatted,
            "pe": pe, "pb": pb, "roe": roe, "roa": roa, "eps": eps, "bvps": bvps, "lnst": lnst,
            "financials": financials, "history": history,
            "ema34": ema34, "ema89": ema89
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý dữ liệu chi tiết mã {symbol}: {str(e)}")
