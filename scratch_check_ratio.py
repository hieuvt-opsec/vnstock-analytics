import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

sys.path.append('d:/LiveTrading/backend')
from vnstock.api.financial import Finance
import pandas as pd

try:
    f = Finance(symbol='HPG', source='VCI')
    ratio_df = f.ratio()
    if ratio_df is not None and not ratio_df.empty:
        print("HPG ratios columns:", list(ratio_df.columns))
        # Print item names and ids
        for idx, row in ratio_df.iterrows():
            print(f"{row.get('item_id')} | {row.get('item')} | {row.get('item_en')}")
    else:
        print("HPG ratio_df is empty or None")
except Exception as e:
    print("Error:", e)
