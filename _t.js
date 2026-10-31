const fs=require('fs');const id=process.argv[2];const env={};fs.readFileSync('.env','utf8').split(/\r?\n/).forEach(l=>{const m=l.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')});
const auth='Basic '+Buffer.from(env.FRESHDESK_API_KEY+':X').toString('base64');
(async()=>{const d=env.FRESHDESK_DOMAIN.replace(/^https?:\/\//,'').replace(/\/.*$/,'');
const h=async(p)=>{for(;;){const r=await fetch('https://'+d+'/api/v2'+p,{headers:{Authorization:auth}});if(r.status==429){await new Promise(s=>setTimeout(s,(+r.headers.get('retry-after')||20)*1000));continue}return r.json()}};
const dl=async(u,fn,hd)=>{const r=await fetch(u,hd?{headers:{Authorization:auth}}:{});fs.writeFileSync(fn,Buffer.from(await r.arrayBuffer()));console.log('saved',fn,r.status)};
const t=await h('/tickets/'+id+'?include=requester');
console.log(t.subject,'| status',t.status,'| type',t.type,'| created',t.created_at,'| REQ',t.requester&&t.requester.name,'|',JSON.stringify({m:t.custom_fields.cf_module,rca:t.custom_fields.cf_rca}));
console.log('DESC',t.description_text);
let i=0;for(const a of t.attachments)await dl(a.attachment_url,'t'+id+'-att'+(++i)+'-'+a.name.replace(/[^\w.]/g,'_'));
let j=0;for(const m of t.description.matchAll(/<img[^>]+src="([^"]+)"/g))await dl(m[1].replace(/&amp;/g,'&'),'t'+id+'-desc'+(++j)+'.png',true);
const c=await h('/tickets/'+id+'/conversations');
for(const x of c){if(x.private&&!x.incoming&&/acknowledge|has been changed/i.test(x.body_text||''))continue;console.log('\n--CONV',x.id,'priv',x.private,'in',x.incoming,x.created_at,'uid',x.user_id,'\n',(x.body_text||'').slice(0,2000));
for(const a of x.attachments||[])await dl(a.attachment_url,'t'+id+'-c'+x.id+'-'+a.name.replace(/[^\w.]/g,'_'));
let k=0;for(const m of x.body.matchAll(/<img[^>]+src="([^"]+)"/g))await dl(m[1].replace(/&amp;/g,'&'),'t'+id+'-c'+x.id+'-img'+(++k)+'.png',true);}
})()
