with open('d:/LiveTrading/frontend/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

for word in ['30.95', 'Techcombank', 'tcb']:
    matches = content.lower().count(word)
    print(f"Occurrences of '{word}': {matches}")
