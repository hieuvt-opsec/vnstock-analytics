with open('d:/LiveTrading/backend/services/stock_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

import re
matches = [m.start() for m in re.finditer('def get_stock_history_internal', content)]
if matches:
    start = matches[0]
    # print 1500 characters
    print(content[start:start+1500])
else:
    print("Function not found")
