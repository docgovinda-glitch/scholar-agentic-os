import os
import re

directory = "src/desk/workspace/stages"

for filename in os.listdir(directory):
    if not filename.endswith(".tsx"): continue
    
    filepath = os.path.join(directory, filename)
    with open(filepath, "r") as f:
        content = f.read()
    
    # We want to replace:
    # if (!response.ok) {
    #   throw new Error("Agent encountered an error during discovery.");
    # }
    # const { data } = await response.json();
    # 
    # WITH:
    # if (!response.ok) {
    #   const errBody = await response.json().catch(() => ({}));
    #   throw new Error(errBody.error || "Agent encountered an error.");
    # }
    # const { data } = await response.json(); # WAIT! We can't call response.json() twice!
    
    # Actually, it's better to just use the `json` wrapper from api.ts.
    # But some files don't import `json`.
    
    # Let's do this:
    # const resJson = await response.json();
    # if (!response.ok) throw new Error(resJson.error || "Agent encountered an error.");
    # const { data } = resJson;
    
    # Let's find all occurrences of:
    # if (!response.ok) { ... throw new Error("..."); }
    # const { data } = await response.json();
    
    pattern = re.compile(r'if\s*\(!response\.ok\)\s*\{\s*throw new Error\("([^"]+)"\);\s*\}\s*const\s*\{\s*data\s*\}\s*=\s*await\s*response\.json\(\);')
    
    replacement = r'''const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "\1");
      }
      const { data } = resJson;'''
    
    new_content = pattern.sub(replacement, content)
    
    if new_content != content:
        with open(filepath, "w") as f:
            f.write(new_content)
        print(f"Updated {filename}")
