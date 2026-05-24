import os

path = r'f:\mehmetgundonergmail\developing\react\sorub\mgtest\Views\mgtest\CreateBank.cshtml'
with open(path, 'rb') as f:
    content = f.read()

# Try to find the section with wildcards/flexible matching
import re
pattern = rb'onclick="pdfOlustur\(\'secili\', false\)">\s*<i class="bi bi-check2-square"></i> PDF \([^\)]+\)\s*</button>\s*</div>'

def replacement(match):
    return match.group(0)[:-6] + b'''
                <button class="btn btn-warning" onclick="secilenlerdenYeniBanka()">
                    <i class="bi bi-collection"></i> Seçililerden Yeni Banka
                </button>
            </div>'''.replace(b'\n', b'\r\n')

new_content = re.sub(pattern, replacement, content)

with open(path, 'wb') as f:
    f.write(new_content)

print("Replacement done")
