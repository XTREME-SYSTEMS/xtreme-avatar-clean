import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR_NEON_AUTH_BASE_URL, AVATAR_TASK_QA_BRANCH, AVATAR_TASK_QA_ORIGIN, readAuthConfiguration } from "../src/lib/auth/config.ts";

const isolated = "https://ep-qa-identity.neonauth.c-16.us-east-1.aws.neon.tech/neondb/auth";
const qa = { VERCEL_ENV:"preview", VERCEL_GIT_COMMIT_REF:AVATAR_TASK_QA_BRANCH,
  AVATAR_APP_ORIGIN:AVATAR_TASK_QA_ORIGIN, NEON_AUTH_BASE_URL:isolated, AVATAR_QA_NEON_AUTH_BASE_URL:isolated };
test("only the exact QA branch, origin and independently pinned isolated issuer are allowed", () => {
  assert.deepEqual(readAuthConfiguration(qa),{configured:true,value:{baseUrl:isolated,appOrigin:AVATAR_TASK_QA_ORIGIN}});
  for (const patch of [
    {AVATAR_QA_NEON_AUTH_BASE_URL:undefined},
    {AVATAR_APP_ORIGIN:"https://different.example.test"},
    {VERCEL_GIT_COMMIT_REF:"different"},
    {VERCEL_ENV:"production"},
    {NEON_AUTH_BASE_URL:AVATAR_NEON_AUTH_BASE_URL,AVATAR_QA_NEON_AUTH_BASE_URL:AVATAR_NEON_AUTH_BASE_URL},
    {NEON_AUTH_BASE_URL:"https://qa.neonauth.example.test/neondb/auth",AVATAR_QA_NEON_AUTH_BASE_URL:"https://qa.neonauth.example.test/neondb/auth"},
  ]) assert.equal(readAuthConfiguration({...qa,...patch}).configured,false);
});
test("unrelated previews and production preserve the previously pinned issuer", () => {
  assert.equal(readAuthConfiguration({ VERCEL_ENV:"production", AVATAR_APP_ORIGIN:"https://www.xtremeavatar.com", NEON_AUTH_BASE_URL:AVATAR_NEON_AUTH_BASE_URL }).configured,true);
  assert.equal(readAuthConfiguration({ VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"feat/mobile-v4", AVATAR_APP_ORIGIN:"https://other.example.test", NEON_AUTH_BASE_URL:AVATAR_NEON_AUTH_BASE_URL }).configured,true);
});
