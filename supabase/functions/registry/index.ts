// Supabase Edge Function. Deploy with --no-verify-jwt to support no-login access.
// IMPORTANT: Anyone on the internet can invoke this public endpoint. Apply gateway
// rate limits and abuse protection before sharing publicly.
import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 try{
  const raw=await req.text();if(raw.length>4000)return respond({error:'Request too large'},413);
  const body=JSON.parse(raw);const action=body.action;
  if(!['list','create','update','delete','restore'].includes(action))return respond({error:'Invalid action'},400);
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if(!url||!key)return respond({error:'Server is not configured'},500);
  const db=createClient(url,key,{auth:{persistSession:false}});
  if(action==='list'){
   const [a,h]=await Promise.all([db.from('letters').select('id,number_key,number_display,owner,note,version,created_at,updated_at,deleted_at').order('number_key',{ascending:true}).limit(3000),db.from('letter_history').select('id,action,version,snapshot,created_at').order('created_at',{ascending:false}).limit(100)]);
   if(a.error||h.error)throw a.error||h.error;
   return respond({records:(a.data||[]).filter(x=>!x.deleted_at),trash:(a.data||[]).filter(x=>x.deleted_at),history:h.data||[]});
  }
  if(action==='create'||action==='update'){
   if(typeof body.number!=='string'||!/^\d{1,8}$/.test(body.number)||typeof body.owner!=='string'||!body.owner.trim()||body.owner.length>100||typeof body.note!=='string'||body.note.length>500)return respond({error:'ข้อมูลไม่ถูกต้อง'},400);
  }
  if(action!=='create'&&(!/^[0-9a-f-]{36}$/i.test(body.id||'')||!Number.isInteger(body.expectedVersion)))return respond({error:'Invalid record or version'},400);
  const {data,error}=await db.rpc('registry_mutate',{p_action:action,p_id:action==='create'?null:body.id,p_expected_version:action==='create'?null:body.expectedVersion,p_number:body.number??null,p_owner:body.owner??null,p_note:body.note??null});
  if(error)return respond({error:error.message},409);
  return respond(data);
 }catch(e){return respond({error:e instanceof SyntaxError?'Invalid JSON':'Request failed'},400)}
});
