import sys
import os

# Add backend directory to sys.path so we can import services
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from services.stock_service import get_stock_full_analysis

try:
    print("Testing get_stock_full_analysis('HPG')...")
    res = get_stock_full_analysis("HPG")
    print("Keys in response:", list(res.keys()))
    
    # Check history structure
    history = res.get("history", [])
    if history:
        print("Number of history records:", len(history))
        latest = history[-1]
        print("Latest record keys:", list(latest.keys()))
        print(f"Latest values - Close: {latest.get('close')}, EMA34: {latest.get('ema34')}, EMA89: {latest.get('ema89')}, MA20: {latest.get('ma20')}, RSI: {latest.get('rsi')}")
    else:
        print("History is empty!")
except Exception as e:
    print("Error calling get_stock_full_analysis:", e)
