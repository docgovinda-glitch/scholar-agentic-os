import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

async function createBucket() {
  const { data, error } = await supabase.storage.createBucket("project-files", {
    public: false,
    fileSizeLimit: 52428800,
  });

  if (error) {
    if (error.message.includes("already exists") || error.message.includes("duplicate key")) {
        console.log("Bucket already exists");
    } else {
        console.error("Failed to create bucket:", error.message);
    }
  } else {
    console.log("Bucket created successfully:", data);
  }
}

createBucket();
