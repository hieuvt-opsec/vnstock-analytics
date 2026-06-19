with open('d:/LiveTrading/backend/services/stock_service.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'def get_shareholders_internal' in line:
        print(f"Line {i+1}: {line.strip()}")
