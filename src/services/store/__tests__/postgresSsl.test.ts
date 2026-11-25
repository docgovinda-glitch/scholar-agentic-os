import { describe, it, expect } from "vitest";
import { postgresSslFor } from "../pgProjectStore";
import { SUPABASE_ROOT_CA } from "../supabaseRootCa";

const VERIFIED = { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };

describe("postgresSslFor", () => {
  it("skips TLS only for a database on this machine", () => {
    expect(postgresSslFor("postgresql://postgres@localhost:5432/db")).toBeUndefined();
    expect(postgresSslFor("postgres://postgres@LOCALHOST/db")).toBeUndefined();
    expect(postgresSslFor("postgresql://postgres@127.0.0.1:54322/postgres")).toBeUndefined();
    expect(postgresSslFor("postgresql://postgres@[::1]:5432/db")).toBeUndefined();
  });

  it("keeps verified TLS for every remote host, Supabase included", () => {
    expect(postgresSslFor("postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres")).toEqual(VERIFIED);
    expect(postgresSslFor("postgresql://postgres:pw@db.abcd.supabase.co:5432/postgres")).toEqual(VERIFIED);
    expect(postgresSslFor("postgresql://u@10.0.0.5:5432/db")).toEqual(VERIFIED);
  });

  it("is not fooled by 'localhost' outside the hostname", () => {
    expect(postgresSslFor("postgresql://u:localhost@db.example.com:5432/db")).toEqual(VERIFIED); // password
    expect(postgresSslFor("postgresql://localhost:pw@db.example.com:5432/db")).toEqual(VERIFIED); // user name
    expect(postgresSslFor("postgresql://u@db.example.com:5432/localhost_backup")).toEqual(VERIFIED); // database
    expect(postgresSslFor("postgresql://u@db.localhost.example.com:5432/db")).toEqual(VERIFIED); // remote host
    expect(postgresSslFor("postgresql://u@localhost.example.com/db")).toEqual(VERIFIED);
    expect(postgresSslFor("postgresql://u@db.example.com/db?host=localhost")).toEqual(VERIFIED); // query string
  });

  it("fails closed when the string is not a URL", () => {
    expect(postgresSslFor("host=localhost user=postgres dbname=db")).toEqual(VERIFIED);
    expect(postgresSslFor("")).toEqual(VERIFIED);
  });
});
