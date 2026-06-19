import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('d:/LiveTrading/backend/services/stock_service.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx in range(296, 337):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx].rstrip()}")
