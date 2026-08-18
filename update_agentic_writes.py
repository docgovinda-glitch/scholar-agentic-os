import re

with open("server/routes/project/agentic.ts", "r") as f:
    content = f.read()

# 1. Update POST /evidence-extraction
evidence_replace = """    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    
    // Insert into Supabase
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      const table = new SupabaseTable(config, "project_evidence");
      for (const ev of result.data) {
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.projectId,
            quote: ev.quote || "",
            claim_type: ev.claim_type || "",
            strength: ev.strength || "",
            tags: ev.tags || []
          })
        });
      }
    }
    
    res.json({ ok: true, data: result.data });"""
content = content.replace(
    '    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);\n    res.json({ ok: true, data: result.data });',
    evidence_replace, 1
)

# 2. Update POST /draft
draft_replace = """    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    
    // Insert into Supabase
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      const table = new SupabaseTable(config, "manuscript_sections");
      for (const sec of result.data) {
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify({
            project_id: project.projectId,
            section_name: sec.section,
            content: sec.content || "",
            status: sec.status || "Drafted",
            word_count: sec.length || 0
          })
        });
      }
    }
    
    res.json({ ok: true, data: result.data });"""
content = content.replace(
    '    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);\n    res.json({ ok: true, data: result.data });',
    draft_replace, 1
)

# 3. Update POST /peer-review
peer_replace = """    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    
    // Insert into Supabase
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      const table = new SupabaseTable(config, "peer_review_critiques");
      for (const crit of result.data) {
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.projectId,
            lens: crit.lens,
            feedback: crit.feedback,
            severity: crit.severity || "Moderate"
          })
        });
      }
    }
    
    res.json({ ok: true, data: result.data });"""
content = content.replace(
    '    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);\n    res.json({ ok: true, data: result.data });',
    peer_replace, 1
)

# 4. Update POST /revision (also updates manuscript_sections)
rev_replace = """    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);
    
    // Update into Supabase
    const config = getSupabaseRestConfig();
    if (config && result.data && Array.isArray(result.data)) {
      const table = new SupabaseTable(config, "manuscript_sections");
      for (const sec of result.data) {
        await table.request("", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify({
            project_id: project.projectId,
            section_name: sec.section,
            content: sec.content || "",
            status: sec.status || "Revised",
            word_count: sec.length || 0
          })
        });
      }
    }
    
    res.json({ ok: true, data: result.data });"""
content = content.replace(
    '    const result = await callOpenRouterJSON(systemPrompt, `Context: ${context}`);\n    res.json({ ok: true, data: result.data });',
    rev_replace, 1
)

with open("server/routes/project/agentic.ts", "w") as f:
    f.write(content)

print("Updated POST endpoints to write to Supabase.")
