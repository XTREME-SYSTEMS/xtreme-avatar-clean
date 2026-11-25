import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = new URL('..', import.meta.url);
const contract = JSON.parse(readFileSync(new URL('architecture/product.json', root), 'utf8'));
const forbidden = /(?:^|[/@_-])(?:supabase|base44)(?:$|[/@_-])/i;
function files(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(e => {
    if (['.git','node_modules','.next','.vercel','coverage','artifacts'].includes(e.name)) return [];
    const p = join(dir,e.name); return e.isDirectory() ? files(p) : e.isFile() ? [p] : [];
  });
}
test('new repo canonical authority and no duplicate systems', () => {
  assert.equal(contract.repository,'XTREME-SYSTEMS/xtreme-avatar-clean');
  assert.equal(contract.canonical.identity.project,'delicate-scene-98135330');
  assert.equal(contract.canonical.memory.project,'divine-grass-10157171');
  assert.equal(contract.security.new_brain,false);
  assert.equal(contract.security.new_database,false);
  assert.equal(contract.security.legacy_runtime,false);
});
test('workspace and discovery remain in scope',()=>{
 const pages=Object.fromEntries(contract.pages.map(p=>[p.route,p]));
 for(const f of ['Gmail','Drive','Calendar','Docs','Sheets','Slides','Contacts','Tasks','Meet','Forms','Google Chat']) assert.ok(pages['/workspace'].features.includes(f),f);
 for(const f of ['leads','companies','professional decision-makers and leaders','public-source research','deduplication']) assert.ok(pages['/discovery'].features.includes(f),f);
});
test('deny known legacy dependencies and files',()=>{
 for(const p of files(process.cwd())){
  const r=relative(process.cwd(),p).replaceAll('\\','/');
  if(r.startsWith('docs/')||r.startsWith('architecture/')||r.startsWith('tests/')||r==='AGENTS.md'||r==='README.md')continue;
  assert.ok(!/(?:^|\/)(supabase|home-html\.[^/]+)(?:\/|$)/i.test(r),r);
  if(r.endsWith('package.json')) { const j=JSON.parse(readFileSync(p,'utf8'));for(const section of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])for(const name of Object.keys(j[section]??{}))assert.ok(!forbidden.test(name),name); }
  if(r==='package-lock.json'){const j=JSON.parse(readFileSync(p,'utf8'));for(const name of Object.keys(j.packages??{}))assert.ok(!forbidden.test(name),name);}
  if(/\.(?:mjs|cjs|js|jsx|ts|tsx)$/.test(r))assert.ok(!/(?:@supabase\/|@base44\/|NEXT_PUBLIC_SUPABASE_|SUPABASE_SERVICE_ROLE_KEY|HOME_HTML)/.test(readFileSync(p,'utf8')),r);
 }
});

test('four flagship pillars and dedicated lead finder remain explicit',()=>{
 const pages=Object.fromEntries(contract.pages.map(p=>[p.route,p]));
 assert.deepEqual(contract.product_pillars.map(p=>p.id),['avatar','invention','leads','social']);
 assert.deepEqual(contract.product_pillars.map(p=>p.route),['/','/invention','/leads','/social']);
 for(const p of contract.product_pillars) assert.ok(pages[p.route],p.route);
 assert.ok(contract.navigation.primary.includes('/leads'));
 for(const f of ['natural-language lead search','source citations','qualification score','deduplication','pipeline status','Google Sheets export','reviewed outreach drafts']) assert.ok(pages['/leads'].features.includes(f),f);
 for(const f of ['market validation','business plans','approval mockups','reviewed engineering handoff']) assert.ok(pages['/invention'].features.includes(f),f);
 assert.match(contract.security.outreach,/no automatic sends/);
 assert.ok(existsSync(new URL('docs/LEAD_FINDER.md', root)));
 assert.ok(existsSync(new URL('docs/INVENTION_MACHINE.md', root)));
});

test('reuse Auto Social with explicit delivery gates',()=>{
 const social=contract.pages.find(p=>p.route==='/social');
 for(const f of ['AI copy and image drafts','versioned approval queue','content calendar','authorized publishing','delivery receipts','engagement analytics']) assert.ok(social.features.includes(f),f);
 assert.ok(contract.navigation.primary.includes('/social'));
 assert.equal(contract.canonical.auto_social.site,'https://eden-auto-social.strategic-ai.chatgpt.site');
 assert.match(contract.security.social_publishing,/No external publishing until/);
 assert.match(contract.module_policy,/no new social engine or duplicate scheduler/);
 assert.ok(existsSync(new URL('docs/AUTO_SOCIAL.md',root)));
});
