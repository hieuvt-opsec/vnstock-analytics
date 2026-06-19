import sys
sys.stdout.reconfigure(encoding='utf-8')
from vnstock.api.financial import Finance
import pandas as pd

f = Finance(symbol='TCB', source='VCI')
ratio_df = f.ratio()
is_df = f.income_statement(period='year')
bs_df = f.balance_sheet(period='year')

pe, pb, roe, roa = None, None, None, None
if ratio_df is not None and not ratio_df.empty:
    period_cols = [c for c in ratio_df.columns if c not in ['item', 'item_en', 'item_id']]
    latest_col = period_cols[-1] if period_cols else None
    
    if latest_col:
        for _, row in ratio_df.iterrows():
            item_id = str(row.get('item_id', '')).lower()
            val = row.get(latest_col)
            if not pd.isna(val):
                try:
                    val = float(val)
                    if 'pe_ratio' in item_id or 'pe' == item_id:
                        pe = val
                    elif 'pb_ratio' in item_id or 'pb' == item_id:
                        pb = val
                    elif 'roe' in item_id:
                        roe = val * 100.0 if abs(val) < 1.0 else val
                    elif 'roa' in item_id:
                        roa = val * 100.0 if abs(val) < 1.0 else val
                except (ValueError, TypeError):
                    pass

print("Fixed ratios:", pe, pb, roe, roa)

# Test financials parsing
financials = []
if is_df is not None and not is_df.empty:
    year_cols = [c for c in is_df.columns if c not in ['item', 'item_en', 'item_id'] and c.isdigit()]
    year_cols = sorted(year_cols, reverse=True)[:3]
    
    is_df_unique = is_df.drop_duplicates(subset=['item_id']) if 'item_id' in is_df.columns else is_df
    bs_df_unique = bs_df.drop_duplicates(subset=['item_id']) if bs_df is not None and not bs_df.empty and 'item_id' in bs_df.columns else bs_df
    
    is_dict = is_df_unique.set_index('item_id').to_dict(orient='index') if 'item_id' in is_df_unique.columns else {}
    bs_dict = bs_df_unique.set_index('item_id').to_dict(orient='index') if bs_df_unique is not None and not bs_df_unique.empty and 'item_id' in bs_df_unique.columns else {}
    
    # Priority keys
    rev_key = next((k for k in is_dict.keys() if str(k).lower() in ['net_sales', 'sales', 'total_operating_income', 'net_interest_income']), None)
    if not rev_key:
        rev_key = next((k for k in is_dict.keys() if any(x in str(k).lower() for x in ['revenue', 'doanh thu', 'sales', 'operating_income', 'total_operating_income'])), None)

    np_key = next((k for k in is_dict.keys() if str(k).lower() == 'net_profit_loss_after_tax'), None)
    if not np_key:
        np_key = next((k for k in is_dict.keys() if 'profit_after_tax' in str(k).lower() or 'sau thuế' in str(k).lower() or 'sau thu' in str(k).lower()), None)

    asset_key = next((k for k in bs_dict.keys() if str(k).lower() == 'total_assets'), None)
    if not asset_key:
        asset_key = next((k for k in bs_dict.keys() if 'total_assets' in str(k).lower() or 'tong_tai_san' in str(k).lower() or 'tổng tài sản' in str(k).lower()), None)
    if not asset_key:
        asset_key = next((k for k in bs_dict.keys() if 'assets' in str(k).lower() or 'tài sản' in str(k).lower() or 'ti sn' in str(k).lower()), None)

    eq_key = next((k for k in bs_dict.keys() if str(k).lower() == 'owners_equity'), None)
    if not eq_key:
        eq_key = next((k for k in bs_dict.keys() if 'owner_equity' in str(k).lower() or 'owners_equity' in str(k).lower() or 'vốn chủ' in str(k).lower() or 'vn ch' in str(k).lower()), None)
    if not eq_key:
        eq_key = next((k for k in bs_dict.keys() if 'equity' in str(k).lower()), None)

    print("Keys found:")
    print("rev_key:", rev_key)
    print("np_key:", np_key)
    print("asset_key:", asset_key)
    print("eq_key:", eq_key)

    for year in year_cols:
        rev_val = is_dict[rev_key].get(year) if rev_key else None
        np_val = is_dict[np_key].get(year) if np_key else None
        asset_val = bs_dict[asset_key].get(year) if asset_key else None
        eq_val = bs_dict[eq_key].get(year) if eq_key else None
        
        def to_billion(val):
            if val is None or pd.isna(val):
                return None
            try:
                v_float = float(val)
                if v_float > 1e6:
                    return round(v_float / 1e9, 1)
                return round(v_float, 1)
            except Exception:
                return None
                
        financials.append({
            "period": year,
            "revenue": to_billion(rev_val),
            "net_profit": to_billion(np_val),
            "assets": to_billion(asset_val),
            "equity": to_billion(eq_val)
        })

print("Financials parsed:")
for f in financials:
    print(f)
