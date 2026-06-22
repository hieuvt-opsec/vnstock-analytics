import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import vnstock
print("Vnstock status:")
try:
    vnstock.check_status()
except Exception as e:
    print("Error:", e)
