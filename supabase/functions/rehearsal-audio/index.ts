// Private audio access using the EXISTING Firebase sign-in. No second login.
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

const project = 'alabanza-b1d52';
const keys = createRemoteJWKSet(new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } });
// Explicit origins: fail closed until the actual published web origin is supplied.
const origins = new Set((Deno.env.get('ALABANZA_ALLOWED_ORIGINS') ||
  'http://127.0.0.1:5500,http://localhost:5500,https://joshuagg86.github.io').split(',').map(s => s.trim()));
const permittedStems = new Set(['vocals','guitar','bass','piano','drums','other']);
type Manifest = {version:string;recipe:string;model:string;frames:number;decodedFrames:number;
  sampleRate:number;duration:number;totalBytes:number;
  stems:Record<string,{file:string;bytes:number;sha256:string}>};
function validManifest(value: unknown): value is Manifest {
  if (!value || typeof value!=='object') return false;
  const m=value as Manifest;
  if (!/^[a-f0-9]{64}$/.test(m.version || '') || m.recipe!=='aac-96k-44100-v1'
      || !Number.isInteger(m.frames) || m.frames<=0 || m.frames>600*44100 || m.sampleRate!==44100
      || !Number.isInteger(m.decodedFrames) || m.decodedFrames<m.frames || m.decodedFrames-m.frames>=1024
      || !Number.isFinite(m.duration) || Math.abs(m.duration-m.frames/44100)>1/44100
      || !m.stems || typeof m.stems!=='object' || Array.isArray(m.stems)) return false;
  const names=Object.keys(m.stems);
  if (![4,6].includes(names.length) || !['vocals','drums','bass','other'].every(n=>names.includes(n))) return false;
  if (names.length===6 && (!names.includes('guitar') || !names.includes('piano'))) return false;
  if (m.model!==(names.length===6?'htdemucs_6s':'htdemucs')) return false;
  let bytes=0;
  for (const name of names) {
    const file=m.stems[name];
    if (!permittedStems.has(name) || !file || file.file!==name+'.m4a'
        || !Number.isInteger(file.bytes) || file.bytes<=0 || file.bytes>12582912
        || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) return false;
    bytes+=file.bytes;
  }
  return bytes===m.totalBytes;
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  const headers: Record<string,string> = { 'Content-Type':'application/json',
    'Cache-Control':'no-store', 'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS' };
  if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers});
  if (!origins.has(origin)) return reply({detail:'Origen no permitido.'},403);
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (!['GET','POST'].includes(request.method)) return reply({detail:'Método no permitido.'},405);
  const token = request.headers.get('authorization') || '';
  if (!token.startsWith('Bearer ') || token.length > 16384) return reply({detail:'Inicia sesión.'},401);
  let uid='';
  try {
    const {payload} = await jwtVerify(token.slice(7),keys,{
      algorithms:['RS256'], audience:project, issuer:'https://securetoken.google.com/'+project,
      requiredClaims:['sub','iat','exp'], maxTokenAge:'65m', clockTolerance:30 });
    if (!payload.sub || payload.sub.length > 128) return reply({detail:'Sesión inválida.'},401);
    uid=payload.sub;
  } catch (_) { return reply({detail:'Sesión inválida. Vuelve a iniciar sesión.'},401); }
  const url = new URL(request.url);
  const song = url.searchParams.get('song') || '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(song)) return reply({detail:'Canción inválida.'},400);
  const permission=await supabase.from('rehearsal_admins').select('firebase_uid')
    .eq('firebase_uid',uid).eq('enabled',true).maybeSingle();
  if (permission.error) return reply({detail:'No se pudieron verificar los permisos.'},503);
  const canPublish=Boolean(permission.data);
  if (request.method==='POST') {
    if (!canPublish) return reply({detail:'Esta cuenta no está autorizada para subir audios.'},403);
    let body;
    try {
      const text=await request.text();
      if (text.length>16384) return reply({detail:'Solicitud demasiado grande.'},413);
      body=JSON.parse(text);
    } catch (_) {return reply({detail:'Solicitud inválida.'},400);}
    if (!validManifest(body.manifest) || !['prepare','commit'].includes(body.action)) return reply({detail:'Información de audio inválida.'},400);
    const m:Manifest=body.manifest;
    const previous=await supabase.from('rehearsal_audio').select('manifest').eq('song_id',song).maybeSingle();
    if (previous.error) return reply({detail:'No se pudo consultar el audio.'},503);
    if (previous.data?.manifest?.version===m.version) return reply({alreadyPublished:true});
    if (!previous.data) {
      const count=await supabase.from('rehearsal_audio').select('song_id',{count:'exact',head:true});
      if (count.error) return reply({detail:'No se pudo verificar el límite del piloto.'},503);
      if ((count.count || 0)>=7) return reply({detail:'La prueba admite siete canciones.'},409);
    }
    const prefix=`${song}/${m.version}`;
    const listing=await supabase.storage.from('ensayo-audio').list(prefix,{limit:100});
    if (listing.error) return reply({detail:'No se pudo verificar el almacenamiento.'},503);
    const existing=new Map((listing.data || []).map(file=>[file.name,file]));
    if (body.action==='prepare') {
      const uploads:Record<string,string>={};
      for (const name of Object.keys(m.stems)) {
        const saved=existing.get(name+'.m4a');
        if (saved && Number(saved.metadata?.size)===m.stems[name].bytes) continue;
        if (saved) return reply({detail:'Una pista guardada tiene un tamaño inesperado.'},409);
        const result=await supabase.storage.from('ensayo-audio').createSignedUploadUrl(`${prefix}/${name}.m4a`);
        if (result.error || !result.data?.signedUrl) return reply({detail:'No se pudo autorizar la carga.'},503);
        uploads[name]=result.data.signedUrl;
      }
      return reply({uploads});
    }
    for (const name of Object.keys(m.stems)) {
      const file=existing.get(name+'.m4a');
      if (!file || Number(file.metadata?.size)!==m.stems[name].bytes) return reply({detail:'Aún faltan pistas por subir.'},409);
    }
    const commit=await supabase.rpc('publish_rehearsal_audio',{p_song_id:song,p_manifest:m});
    if (commit.error) return reply({detail:'No se pudo publicar el audio; revisa el límite del piloto.'},409);
    return reply({published:true});
  }
  const {data,error} = await supabase.from('rehearsal_audio').select('manifest').eq('song_id',song).maybeSingle();
  if (error) return reply({detail:'No se pudo consultar el audio.'},503);
  if (!data) return reply({state:'sin_audio',ready:false,canPublish});
  const manifest = data.manifest;
  if (!validManifest(manifest)) return reply({detail:'Audio inválido.'},503);
  const files: Record<string,string> = {};
  for (const name of Object.keys(manifest.stems)) {
    if (!permittedStems.has(name)) return reply({detail:'Audio inválido.'},503);
    const path = `${song}/${manifest.version}/${name}.m4a`;
    const result = await supabase.storage.from('ensayo-audio').createSignedUrl(path,900);
    if (result.error || !result.data?.signedUrl) return reply({detail:'No se pudieron preparar las pistas.'},503);
    files[name] = result.data.signedUrl;
  }
  return reply({state:'listo',ready:true,version:manifest.version,model:manifest.model,
    duration:manifest.duration,frames:manifest.frames,sampleRate:manifest.sampleRate,
    stems:Object.keys(files),files,expiresAt:Date.now()+900000,cloud:true,canPublish});
});
