import os
import glob
import json
import re

# Definiions
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
VOCA_DIR = os.path.join(PROJECT_ROOT, "vocab")
WEB_DIR = os.path.join(PROJECT_ROOT, "web")
DATA_FILE = os.path.join(WEB_DIR, "data.js")

# POS Mapping (Fallback if not found in file)
POS_MAP = {
    "Exhaust": "동사, 명사",
    "Intense": "형용사",
    "Deny": "동사",
    "Nucleus": "명사",
    "Demand": "동사, 명사",
    "Understand": "동사",
    "Ignore": "동사",
    "Defeat": "동사, 명사",
    "Concept": "명사",
    "Capable": "형용사",
    "Approach": "동사, 명사",
    "Primary": "형용사",
    "Strict": "형용사",
    "Balance": "명사, 동사",
    "Attempt": "동사, 명사",
    "Debt": "명사",
    "Reveal": "동사",
    "Appropriate": "형용사, 동사",
    "Measure": "동사, 명사",
    "Status": "명사",
    "Element": "명사",
    "Recall": "동사, 명사",
    "Risky": "형용사",
    "Direct": "형용사, 동사",
    "Splendid": "형용사"
}

def clean_text(text):
    if not text: return ""
    return text.replace('**', '').strip()

def process_single_file(filepath):
    filename = os.path.basename(filepath)
    
    # 1. Basic Info from Filename
    # Matches "0001. Exhaust.md" or "0001. Exhaust (v2).md"
    match = re.search(r'(\d+)\.\s*([^().]+)', filename)
    if not match:
        return None
    
    file_id = match.group(1)
    word = match.group(2).strip()

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 2. Extract Fields using Regex (Robust to whitespace)
    # Logic: Look for the key, then capture everything until the end of line
    
    # Meaning: * **뜻**: ...
    m_meaning = re.search(r'\*\s*\*\*(?:뜻|Meaning)\*\*\s*:\s*(.+)', content)
    meaning = clean_text(m_meaning.group(1)) if m_meaning else ""

    # Pronunciation: * **발음**: ...
    m_pron = re.search(r'\*\s*\*\*(?:발음|Pronunciation)\*\*\s*:\s*(.+)', content)
    pronunciation = clean_text(m_pron.group(1)) if m_pron else ""

    # POS: * **품사**: ...
    # If not in file, try to map from POS_MAP
    m_pos = re.search(r'\*\s*\*\*(?:품사|POS)\*\*\s*:\s*(.+)', content)
    pos = clean_text(m_pos.group(1)) if m_pos else POS_MAP.get(word, "")

    # Nuance Section
    # Captures text between "* **뉘앙스**:" and the next section ("* **..." or end of file)
    nuance = []
    # Find start of Nuance
    nuance_start = re.search(r'\*\s*\*\*(?:뉘앙스|Nuance)\*\*\s*:', content)
    if nuance_start:
        start_idx = nuance_start.end()
        # Find next header to determine end
        next_section = re.search(r'\n\s*\*\s*\*\*', content[start_idx:])
        end_idx = (start_idx + next_section.start()) if next_section else len(content)
        
        nuance_text = content[start_idx:end_idx].strip()
        # Split by lines and clean up
        for line in nuance_text.split('\n'):
            line = line.strip()
            if line and not line.startswith('* **'): # Double check
                nuance.append(clean_text(line.replace('* ', '')))

    # Examples Section
    examples = []
    # Find all lines starting with >
    # We look for the "Examples/예문" header, but generally examples are blockquoted with >
    example_start = re.search(r'\*\s*\*\*(?:📝 예문|Examples)\*\*', content)
    if example_start:
         start_idx = example_start.end()
         examples_text = content[start_idx:]
         for line in examples_text.split('\n'):
             line = line.strip()
             if line.startswith('>'):
                 examples.append(clean_text(line.replace('>', '')))
    
    return {
        "id": file_id,
        "word": word,
        "meaning": meaning,
        "pos": pos,
        "pronunciation": pronunciation,
        "nuance": nuance,
        "examples": examples
    }

def main():
    if not os.path.exists(WEB_DIR):
        os.makedirs(WEB_DIR)

    files = sorted(glob.glob(os.path.join(VOCA_DIR, "*.md")))
    data_list = []

    print(f"Processing {len(files)} files...")

    for filepath in files:
        if "Study Guide" in filepath: continue
        
        entry = process_single_file(filepath)
        if entry:
            data_list.append(entry)
            
            # Simple check to see if we missed Meaning
            if not entry['meaning']:
                print(f"[Warning] ID {entry['id']} ({entry['word']}) has no meaning extracted.")

    # Write Javascript File
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json_str = json.dumps(data_list, ensure_ascii=False, indent=2)
        f.write(f"const VOCA_DATA = {json_str};")
    
    print(f"Successfully generated {DATA_FILE} with {len(data_list)} entries.")

if __name__ == "__main__":
    main()
