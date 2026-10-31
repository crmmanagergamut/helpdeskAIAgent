const fs=require('fs'),https=require('https');
const env={};for(const l of fs.readFileSync(__dirname+'/.env','utf8').split('\n')){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim();}
function get(p){return new Promise((res,rej)=>{https.get({hostname:env.FRESHDESK_DOMAIN,path:p,auth:env.FRESHDESK_API_KEY+':X'},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch{res(d)}})}).on('error',rej)})}
(async()=>{
 const id=process.argv[2];
 const t=await get('/api/v2/tickets/'+id);
 console.log('company_id',t.company_id,'requester_id',t.requester_id);
 const r=await get('/api/v2/contacts/'+t.requester_id);
 console.log('requester',r.name,r.email,'company_id',r.company_id);
 const cid=t.company_id||r.company_id;
 if(cid){const c=await get('/api/v2/companies/'+cid);console.log('company',c.name,JSON.stringify(c.custom_fields));}
})();
