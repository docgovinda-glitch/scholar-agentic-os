import re

# Update types.ts
with open("src/services/store/types.ts", "r") as f:
    content = f.read()

if "delete(projectId: string): Promise<void>;" not in content:
    content = content.replace(
        "get(projectId: string): Promise<ProjectRecord | null>;",
        "get(projectId: string): Promise<ProjectRecord | null>;\n  delete(projectId: string): Promise<void>;"
    )
    with open("src/services/store/types.ts", "w") as f:
        f.write(content)

# Update projectStore.ts (InMemory)
with open("src/services/store/projectStore.ts", "r") as f:
    content = f.read()

if "async delete(projectId" not in content:
    content = content.replace(
        "async get(projectId: string) {",
        "async delete(projectId: string): Promise<void> {\n      this.records.delete(projectId);\n    },\n\n    async get(projectId: string) {"
    )
    with open("src/services/store/projectStore.ts", "w") as f:
        f.write(content)

# Update pgProjectStore.ts (Postgres)
with open("src/services/store/pgProjectStore.ts", "r") as f:
    content = f.read()

if "async delete(projectId" not in content:
    content = content.replace(
        "async get(projectId: string) {",
        "async delete(projectId: string): Promise<void> {\n      await db.query('DELETE FROM projects WHERE project_id = $1', [projectId]);\n    },\n\n    async get(projectId: string) {"
    )
    with open("src/services/store/pgProjectStore.ts", "w") as f:
        f.write(content)

# Update routes/project.ts
with open("server/routes/project.ts", "r") as f:
    content = f.read()

if 'router.delete("/:id"' not in content:
    delete_endpoint = """
router.delete("/:id", requireAuth, async (req, res) => {
  const store = getProjectStore();
  const project = await store.get(req.params.id);
  
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  
  if (project.ownerId !== req.user.id) {
    res.status(403).json({ error: "Not authorized to delete this project" });
    return;
  }

  await store.delete(req.params.id);
  res.status(204).end();
});
"""
    content = content.replace(
        'router.get("/:id", requireAuth, async (req, res) => {',
        delete_endpoint + '\nrouter.get("/:id", requireAuth, async (req, res) => {'
    )
    with open("server/routes/project.ts", "w") as f:
        f.write(content)

print("Added delete method to project stores and API.")
