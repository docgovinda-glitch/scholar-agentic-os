import { config } from "dotenv";
config();
import request from "supertest";
import { app } from "./server.ts";
import { getProjectStore } from "./src/services/store/projectStore.ts";

async function run() {
  const store = getProjectStore();
  const created = await store.create("user-1");
  const res = await request(app)
    .post(`/api/projects/${created.projectId}/submissions`)
    .send({ journalName: "Nature", submittedAt: "2026-01-01", status: "draft" });
  console.log("POST res status:", res.status);
  console.log("POST res body:", res.body);
}
run();
