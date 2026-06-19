with open('d:/LiveTrading/frontend/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'search' in line.lower() or 'select' in line.lower() or 'click' in line.lower() or 'event' in line.lower():
        print(f"{i+1}: {line.strip()}")
