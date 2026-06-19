import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('d:/LiveTrading/backend/services/stock_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = [m.start() for m in re.finditer('def get_realtime_data', content)]
if matches:
    start = matches[0]
    print(content[start:start+1800])
else:
    print("Function not found")
