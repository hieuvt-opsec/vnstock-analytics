import sys
sys.path.append('d:/LiveTrading/backend')
from services.stock_service import get_stock_full_analysis

print("Analysis for TCB:")
tcb = get_stock_full_analysis("TCB")
print("Company:", tcb["company_name"])
print("History length:", len(tcb["history"]))
print("Fundamentals:", tcb["fundamentals"].get("pe", "N/A"))

print("\nAnalysis for FPT:")
fpt = get_stock_full_analysis("FPT")
print("Company:", fpt["company_name"])
print("History length:", len(fpt["history"]))
print("Fundamentals:", fpt["fundamentals"].get("pe", "N/A"))
