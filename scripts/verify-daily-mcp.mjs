import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
const mode=process.argv[2];
if(!['before','after'].includes(mode))throw new Error('Use before or after');
const client=new Client({name:'work-track-daily-readonly-release-check',version:'0.1.0'});
const transport=new StdioClientTransport({command:'npx',args:['-y','mcp-remote','https://wadsworktrack.web.app/mcp','--auth-timeout','600'],env:{...process.env,MCP_REMOTE_CONFIG_DIR:resolve('../../.mcp-auth')},stderr:'inherit'});
try {
await client.connect(transport,{timeout:660000});
const {tools}=await client.listTools();
const names=tools.map(t=>t.name).sort();
console.log(JSON.stringify({mode,toolNames:names}));
const identity=await client.callTool({name:'whoami',arguments:{}});
if(identity.isError)throw new Error('Authenticated identity failed');
console.log('AUTHENTICATED_MCP_PASS');
if(mode==='after'){
if(!names.includes('get_daily_hours'))throw new Error('Tool not published');
const tool=tools.find(t=>t.name==='get_daily_hours');
if(tool.annotations?.readOnlyHint!==true)throw new Error('Read-only annotation absent');
const result=await client.callTool({name:'get_daily_hours',arguments:{date:'2000-01-01',timeZone:'America/Sao_Paulo'}});
if(result.isError)throw new Error(JSON.stringify(result));
const text=result.content.find(c=>c.type==='text')?.text;
const data=JSON.parse(text);
if(data.date!=='2000-01-01'||data.timeZone!=='America/Sao_Paulo'||!Number.isFinite(data.totalMinutes))throw new Error('Unexpected daily report contract');
console.log(JSON.stringify({dailyHours:'PASS',date:data.date,timeZone:data.timeZone,totalMinutes:data.totalMinutes,closedMinutes:data.closedMinutes,estimatedMinutes:data.estimatedMinutes}));
const invalid=await client.callTool({name:'get_daily_hours',arguments:{date:'2026-02-30'}});
if(!invalid.isError)throw new Error('Impossible date accepted');
console.log('INVALID_DATE_REJECTED');
}
} finally {await client.close();await transport.close();}
