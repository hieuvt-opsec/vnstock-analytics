import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

try:
    import vnstock_data
    print("vnstock_data is available!")
    from vnstock_data.api.financial import Finance
    f = Finance(symbol='HPG', source='VCI')
    ratio_df = f.ratio()
    if ratio_df is not None:
        print("Columns from vnstock_data ratio:", list(ratio_df.columns))
    else:
        print("ratio_df from vnstock_data is None")
except ImportError as e:
    print("vnstock_data is NOT installed:", e)
except Exception as e:
    print("Error with vnstock_data:", e)
