import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from fastapi.testclient import TestClient
from main import app

try:
    print("Testing /api/stock/detail?symbol=HPG...")
    client = TestClient(app)
    response = client.get("/api/stock/detail?symbol=HPG")
    print("Status code:", response.status_code)
    
    if response.status_code == 200:
        data = response.json()
        print("Root keys:", list(data.keys()))
        print("Root values - Price:", data.get("price"))
        print("Root values - EMA34:", data.get("ema34"))
        print("Root values - EMA89:", data.get("ema89"))
    else:
        print("Error response:", response.text)
except Exception as e:
    print("Error calling endpoint:", e)
