import re

with open("index.html", encoding="utf-8") as f:
    text = f.read()

refs = re.findall(r'getElementById\([\'"]([^\'"]+)', text)
ids = set(re.findall(r'id=[\'"]([^\'"\s>]+)', text))
missing = [r for r in refs if r not in ids]
print("Missing IDs:", missing)
print("Unique referenced IDs:", len(set(refs)))
