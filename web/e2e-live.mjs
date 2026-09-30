import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const token=readFileSync('../.env','utf8').match(/^SESSION_TOKEN=(.+)$/m)[1].trim().replace(/^['"]|['"]$/g,'');
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1400,height:1000}});
page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log(m.text())});
page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
page.on('response',r=>{if(r.url().includes('/api/')||r.url().includes('/privacy/')) console.log(r.status(),new URL(r.url()).pathname)});
page.on('request',r=>{if(r.url().endsWith('/privacy/v1/inspect')) console.log('SYNTHETIC OCR',r.postData())});
await page.goto('http://localhost:5173');
await page.getByRole('button',{name:'No, not now'}).click();
await page.locator('#pairing-token').fill(token);
await page.getByRole('button',{name:'Context',exact:true}).click();
await page.getByRole('switch',{name:'KBC Assist'}).click();
for(let i=0;i<10;i++){await page.waitForTimeout(1000); console.log(await page.locator('#pipeline-status').innerText()); if(await page.getByRole('button',{name:'Explore KBC car loan'}).count())break;}
await page.screenshot({path:'artifacts/live-car-flow.png',fullPage:true});
console.log((await page.locator('.context-view').innerText()).slice(0,2500));
await browser.close();
