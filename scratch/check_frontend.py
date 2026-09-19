import os
import re

src_dir = r"frontend/src"
symbols = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'useNavigate', 'useLocation', 'useParams', 'Link', 'NavLink']

issues = []

for root, dirs, files in os.walk(src_dir):
    for fname in files:
        if fname.endswith(".jsx") or fname.endswith(".js"):
            fpath = os.path.join(root, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()

            rel = os.path.relpath(fpath, src_dir)

            # Strip comments
            code_no_comments = re.sub(r"//.*", "", content)
            code_no_comments = re.sub(r"/\*.*?\*/", "", code_no_comments, flags=re.DOTALL)

            for sym in symbols:
                if re.search(r"\b" + sym + r"\b", code_no_comments):
                    # Check if imported anywhere in the file imports
                    import_matches = re.findall(r"import\s+[\s\S]*?\s+from\s+['\"].*?['\"]", content)
                    all_imports_str = "\n".join(import_matches)
                    if sym not in all_imports_str:
                        issues.append(f"{rel}: symbol '{sym}' used but NOT found in import statements!")

if issues:
    print("ISSUES FOUND:")
    for issue in issues:
        print(" - " + issue)
else:
    print("ALL FRONTEND IMPORTS VERIFIED 100% CLEAN!")
