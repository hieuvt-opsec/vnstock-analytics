import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('d:/LiveTrading/backend/services/stock_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

import re
# Find generate_mock_fundamental, generate_mock_shareholders, and generate_mock_history
for name in ['def generate_mock_fundamental', 'def generate_mock_shareholders', 'def generate_mock_history', 'def generate_mock_foreign']:
    matches = [m.start() for m in re.finditer(name, content)]
    if matches:
        print(f"=== {name} ===")
        print(content[matches[0]:matches[0]+800])
