from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
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
from services.ai_service import analyze_stock_with_gemini

router = APIRouter(prefix="/api")

@router.get("/market-overview")
async def market_overview():
    """Returns general overview of the Vietnamese stock market (indexes, liquidity, gainers/losers) using real-time data."""
    try:
        data = get_market_overview_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting market overview: {str(e)}")

@router.get("/stock-screener")
async def stock_screener():
    """Scans popular symbols and filters them based on technical indicators (MA, RSI, FVG) using real data."""
    try:
        data = get_screener_data()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running stock screener: {str(e)}")

@router.get("/stock-analysis/{symbol}")
async def stock_analysis(symbol: str):
    """Returns historical OHLC price data with calculated technical indicators for a specific ticker."""
    try:
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ. Phải từ 3 đến 5 ký tự.")
            
        full_analysis = get_stock_full_analysis(symbol)
        
        if not full_analysis or not full_analysis.get("history"):
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu cho mã {symbol.upper()}")
            
        return full_analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing stock {symbol}: {str(e)}")

@router.get("/stock-fundamental/{symbol}")
async def stock_fundamental(symbol: str):
    """Returns fundamental ratios and summary financials for a specific stock."""
    try:
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ. Phải từ 3 đến 5 ký tự.")
            
        full_analysis = get_stock_full_analysis(symbol)
        data = full_analysis.get("fundamentals")
        
        if not data:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu chỉ số cơ bản cho mã {symbol.upper()}")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading fundamentals for {symbol}: {str(e)}")

@router.get("/market-news")
async def market_news():
    """Returns the latest Vietnamese stock market news articles."""
    try:
        data = get_market_news()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading market news: {str(e)}")

@router.get("/stock-foreign/{symbol}")
async def stock_foreign(symbol: str):
    """Returns foreign investor transaction flow history for a specific stock."""
    try:
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ. Phải từ 3 đến 5 ký tự.")
            
        full_analysis = get_stock_full_analysis(symbol)
        data = full_analysis.get("foreign_flow")
        
        if not data:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu dòng tiền khối ngoại cho mã {symbol.upper()}")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading foreign flow for {symbol}: {str(e)}")

@router.get("/stock-shareholders/{symbol}")
async def stock_shareholders(symbol: str):
    """Returns the list of major shareholders and funds for a specific stock."""
    try:
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ. Phải từ 3 đến 5 ký tự.")
            
        full_analysis = get_stock_full_analysis(symbol)
        data = full_analysis.get("shareholders")
        
        if not data:
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu cổ đông cho mã {symbol.upper()}")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading shareholders for {symbol}: {str(e)}")

@router.get("/clear-cache")
async def clear_api_cache():
    """Purges all entries from the memory cache and returns stats."""
    try:
        pre_stats = get_cache_stats()
        cleared_count = clear_cache()
        post_stats = get_cache_stats()
        return {
            "status": "success",
            "message": f"Successfully cleared {cleared_count} cache entries.",
            "before": pre_stats,
            "after": post_stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing cache: {str(e)}")

class ChatRequest(BaseModel):
    symbol: str
    message: str

@router.post("/ai-agent/chat")
async def ai_agent_chat(request: ChatRequest):
    """
    Endpoint nhận câu hỏi của người dùng và gọi Gemini API để phân tích mã cổ phiếu.
    """
    try:
        symbol = request.symbol.upper().strip()
        message = request.message.strip()
        
        if not symbol or len(symbol) < 3 or len(symbol) > 5:
            raise HTTPException(status_code=400, detail="Mã cổ phiếu không hợp lệ. Phải từ 3 đến 5 ký tự.")
            
        if not message:
            raise HTTPException(status_code=400, detail="Nội dung câu hỏi không được để trống.")
            
        # Lấy dữ liệu thực tế hiện tại của mã đó từ stock_service
        full_analysis = get_stock_full_analysis(symbol)
        
        if not full_analysis or not full_analysis.get("history"):
            raise HTTPException(status_code=404, detail=f"Không tìm thấy dữ liệu cho mã {symbol}")
            
        financial_data = full_analysis.get("fundamentals")
        technical_data = full_analysis.get("history")
        
        # Chuyển tiếp sang ai_service để nhận phản hồi từ Gemini
        ai_response = analyze_stock_with_gemini(symbol, financial_data, technical_data, message)
        
        return {
            "symbol": symbol,
            "response": ai_response
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xử lý yêu cầu AI Agent: {str(e)}")
