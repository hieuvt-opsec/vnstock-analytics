import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

sys.path.append('d:/LiveTrading/backend')
from services.stock_service import get_stock_fundamental_internal

print("Fundamental for HPG:")
fund = get_stock_fundamental_internal("HPG")
print(fund)
