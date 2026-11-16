// No external writes: real RSA/JWT verification, mocked certificates and storage.
import { exportJWK, generateKeyPair, SignJWT } from 'npm:jose@5.9.6';

Deno.test('private endpoint: signature, project, expiry, origin and signed playback', async () => {
  Deno.env.set('SUPABASE_URL','https://test.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','local-test-key');
  const {publicKey,privateKey} = await generateKeyPair('RS256');
  const jwk = {...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'};
  const originalFetch = globalThis.fetch, originalServe = Deno.serve;
  let handler: (request: Request) => Promise<Response>;
  const stems=Object.fromEntries(['vocals','guitar','bass','piano','drums','other'].map(name=>
    [name,{file:name+'.m4a',bytes:7,sha256:'b'.repeat(64)}]));
  const manifest={version:'a'.repeat(64),recipe:'aac-96k-44100-v1',stems,duration:8,
    frames:352800,decodedFrames:352800,sampleRate:44100,model:'htdemucs_6s',totalBytes:42};
  let saved: Array<{name:string;metadata:{size:number}}> = [];
  let commits=0;
  const json = (value: unknown) => new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  globalThis.fetch = (input,init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('googleapis.com')) return Promise.resolve(json({keys:[jwk]}));
    if (url.includes('/rest/v1/rehearsal_admins')) return Promise.resolve(json(
      url.includes('eq.owner-uid')?{firebase_uid:'owner-uid'}:[]));
    if (url.includes('/rest/v1/rehearsal_audio')) {
      if (init?.method==='HEAD') return Promise.resolve(new Response(null,{headers:{'content-range':'0-6/7'}}));
      return Promise.resolve(json(url.includes('eq.newsong')?[]:{manifest}));
    }
    if (url.includes('/rest/v1/rpc/publish_rehearsal_audio')) {commits++;return Promise.resolve(json(null));}
    if (url.includes('/storage/v1/object/list/')) return Promise.resolve(json(saved));
    if (url.includes('/storage/v1/object/upload/sign/')) return Promise.resolve(json({url:'/object/upload/sign/ensayo-audio/test.m4a?token=upload-test'}));
    if (url.includes('/storage/v1/object/sign/')) return Promise.resolve(json({signedURL:'/object/sign/test?token=temporary'}));
    throw new Error('Unexpected external request: '+url);
  };
  Deno.serve = ((callback: unknown) => {handler=callback as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
  function assert(value: unknown) {if (!value) throw new Error('Assertion failed');}
  try {
    await import('./index.ts');
    const make = async (audience='alabanza-b1d52',expiry='5m',claims: Record<string,unknown>={},uid='member') => new SignJWT(claims)
      .setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject(uid)
      .setIssuer('https://securetoken.google.com/alabanza-b1d52').setAudience(audience)
      .setIssuedAt().setExpirationTime(expiry).sign(privateKey);
    const request = (token='',origin='http://127.0.0.1:5500') => new Request(
      'https://test.supabase.co/functions/v1/rehearsal-audio?song=song',{
        headers:{origin,authorization:token?'Bearer '+token:''}});
    assert((await handler!(request())).status===401);
    assert((await handler!(request('forged'))).status===401);
    assert((await handler!(request(await make('another-project')))).status===401);
    assert((await handler!(request(await make('alabanza-b1d52','-1h')))).status===401);
    assert((await handler!(request(await make(),'https://evil.test'))).status===403);
    const valid = await handler!(request(await make()));
    assert(valid.status===200);
    assert(valid.headers.get('Cache-Control')==='no-store');
    const body = await valid.json();
    assert(body.ready===true && body.cloud===true && body.files.vocals.includes('token=temporary'));
    const publication={action:'prepare',manifest:{...manifest,version:'c'.repeat(64)}};
    const post=(token:string,body:unknown,song='song') => new Request(
      'https://test.supabase.co/functions/v1/rehearsal-audio?song='+song,{
        method:'POST',headers:{origin:'http://127.0.0.1:5500',authorization:'Bearer '+token,
          'content-type':'application/json'},body:JSON.stringify(body)});
    assert((await handler!(post(await make(),publication))).status===403);
    const admin=await make('alabanza-b1d52','5m',{email:'joshua@genesaret.com',email_verified:false},'owner-uid');
    const spoofedEmail=await make('alabanza-b1d52','5m',{email:'joshua@genesaret.com',email_verified:true});
    assert((await handler!(post(spoofedEmail,publication))).status===403);
    assert((await handler!(post(admin,{...publication,manifest:{...publication.manifest,version:'../evil'}}))).status===400);
    const prepared=await handler!(post(admin,publication));
    assert(prepared.status===200);
    assert(Object.keys((await prepared.json()).uploads).length===6);
    assert((await handler!(post(admin,{...publication,action:'commit'}))).status===409);
    assert(commits===0);
    saved=Object.keys(stems).map(name=>({name:name+'.m4a',metadata:{size:7}}));
    assert((await handler!(post(admin,{...publication,action:'commit'}))).status===200);
    assert(commits===1);
    assert((await handler!(post(admin,publication,'newsong'))).status===409);
  } finally {globalThis.fetch=originalFetch;Deno.serve=originalServe;}
});
