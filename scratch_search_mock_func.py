import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('d:/LiveTrading/frontend/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'getmockstockanalysis' in line.lower():
        print(f"{i+1}: {line.strip()}")
