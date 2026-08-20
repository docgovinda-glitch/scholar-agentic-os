import os
import re

def fix_file(filepath, router_name):
    with open(filepath, "r") as f:
        content = f.read()

    # Replace function definition
    content = re.sub(
        r'export function register[A-Za-z]+Routes\(app: express\.Express, projectLimit: express\.RequestHandler\): void \{',
        f'export function {router_name}(projectLimit: express.RequestHandler): express.Router {{\n  const router = express.Router({{ mergeParams: true }});',
        content
    )

    # Replace app.* endpoints
    def repl(m):
        method = m.group(1)
        path = m.group(2)
        # Strip prefixes
        path = path.replace("/api/projects/:id/claims", "")
        path = path.replace("/api/projects/:id/evidence-ledger", "")
        path = path.replace("/api/projects/:id/evidence", "")
        path = path.replace("/api/projects/:id/compliance", "")
        if path == "":
            path = "/"
        
        return f'router.{method}("{path}"'

    content = re.sub(r'app\.(get|post|put|delete)\("([^"]+)"', repl, content)
    
    # Append `return router;` before the last closing brace
    content = re.sub(r'\}\n*$', '  return router;\n}\n', content)

    with open(filepath, "w") as f:
        f.write(content)
    print(f"Fixed {filepath}")

fix_file("server/routes/project/claims.ts", "claimsRouter")
fix_file("server/routes/project/evidence.ts", "evidenceRouter")
fix_file("server/routes/project/journal_compliance.ts", "journalComplianceRouter")
