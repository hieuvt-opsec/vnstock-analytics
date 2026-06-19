import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('d:/LiveTrading/frontend/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for idx in range(305, 445):
    if idx < len(lines):
        print(f"{idx+1}: {lines[idx].rstrip()}")
