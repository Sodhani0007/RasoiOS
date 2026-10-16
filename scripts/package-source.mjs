import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const files=['package.json','package-lock.json','tsconfig.json','next-env.d.ts','postcss.config.mjs','vitest.config.mts','vercel.json','.gitignore','.vercelignore','.env.example','README.md','DEPLOYMENT.md','PHASE34.md','PHASE25.md','PHASE2.md','AGENTS.md','src','prisma','scripts','tests','public'].filter(existsSync);
const result=spawnSync('tar',['-a','-cf','rasoios-vercel-source.zip','--exclude=*.db','--exclude=*.db-*','--exclude=demo-credentials*',...files],{stdio:'inherit',windowsHide:true});
if(result.error||result.status!==0)throw new Error('Source packaging requires bsdtar with zip support (included with Windows).');
console.log('Created rasoios-vercel-source.zip. Only explicit source paths included; environment secrets, databases, exports and build output excluded.');
