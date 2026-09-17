const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createHash, createPrivateKey, createPublicKey, sign, verify } = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const req = createRequire(`${root}/scripts/near-auth-provider-handoff/package.json`);
const appReq = createRequire(`${root}/apps/web/package.json`);
const { PublicKey, baseEncode, actions, buildDelegateAction, encodeDelegateAction, encodeSignedDelegate, Signature } = req('near-api-js');
const sha = value => createHash('sha256').update(value).digest('hex');
const fixtureTimeMs = 1785589300000;
const fixture = fs.readFileSync(`${root}/scripts/near-auth-provider-handoff/prompt-size.test.mjs`, 'utf8');
const context = { actions, assert, Buffer, sha, key: PublicKey.fromString('ed25519:11111111111111111111111111111111'), account: 'a'.repeat(64), usdc: 'b'.repeat(64) };
vm.createContext(context);
vm.runInContext(fixture.slice(fixture.indexOf('function upload(title)'), fixture.indexOf('function encode(kind')), context);
const upstream = { exports: {}, Uint8Array, require: req };
vm.runInNewContext(fs.readFileSync(`${root}/scripts/near-auth-provider-handoff/upstream/authorize-app.action.cjs`, 'utf8'), upstream);
const esbuild = createRequire(`${root}/workers/livepeer-bridge/package.json`)('esbuild');
const compiled = esbuild.buildSync({ entryPoints: [`${root}/protocol/paid-media-livepeer-v1/compact-upload.ts`], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const codecModule = { exports: {} };
vm.runInNewContext(compiled, { module: codecModule, exports: codecModule.exports, crypto, TextEncoder, TextDecoder, btoa, atob, Uint8Array });
const { packCompactUpload, unpackCompactUpload } = codecModule.exports;
const json = value => JSON.stringify(value);
const canonical = q => Object.entries(q).filter(([k]) => k !== 'quote_id').map(([,v]) => String(v)).join('\n');
function pair(seed) {
    const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, seed)]), format: 'der', type: 'pkcs8' });
    const publicKey = createPublicKey(privateKey);
    const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
    return { privateKey, publicKey, raw, text: `ed25519:${baseEncode(raw)}` };
}

(async () => {
    const { generateKeyPair, SignJWT, EncryptJWT, jwtVerify } = await import(appReq.resolve('jose'));
    const rsa = await generateKeyPair('RS256');
    const issuer = 'https://login.testnet.fast-auth.com/';
    const aud = ['auth0.jwt.fast-auth.testnet', `${issuer}userinfo`];
    const rows = []; const vectors = [];
    for (const seed of [1, 2, 7, 23]) for (const [name,title] of [
        ['normal', 'Synthetic upload test'], ['ascii200', 'z'.repeat(200)], ['unicode200', '😀'.repeat(50)],
        ['turkish200', 'İğüşöç'.repeat(16)+'abcd1234'], ['escaped200', '"\\\n'.repeat(66)+'aa']
    ]) for (const jobLength of [39, 128]) for (const market of ['market.testnet','video-market-v1-260907.youtick-dev-v3.testnet','m'.repeat(56)+'.testnet']) {
        const owner=pair(seed), device=pair(seed+40), upload=pair(seed+80), quoteKey=pair(seed+120);
        context.account=owner.raw.toString('hex'); context.key=PublicKey.fromString(owner.text);
        context.usdc='3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
        const original=JSON.parse(Buffer.from(context.upload(title).functionCall.args).toString());
        original.receiver_id=market;
        const m=JSON.parse(original.msg), q=m.sponsor_quote; q.contract_id=market;
        m.job_id=jobLength===39?'lp-00000000-0000-4000-8000-000000000001':'j'.repeat(128);
        m.expected_source_bytes='5000000000'; m.price_usdc='99999999999999999999';
        m.profile_config_sha256=JSON.parse(fs.readFileSync(`${root}/protocol/paid-media-livepeer-v1/profiles.json`)).adaptive.hash;
        m.upload_public_key=upload.text;
        const nowMs=fixtureTimeMs;
        m.upload_key_expires_at_ms=String(nowMs+86_399_000);
        const cert={ account_id: context.account, authorization_duration_ms: '2592000000', contract_id: original.receiver_id,
            domain: 'youtick.device-session', network:'testnet', origin_hash:sha('http://localhost:3000'), scopes:['play'], session_public_key:device.text, version:'3' };
        m.playback_session={session_public_key:device.text,certificate_sha256:sha(json(cert)),authorization_duration_ms:'2592000000'};
        const request={}; for (const key of ['creator_id','job_id','title','price_usdc','expected_source_bytes','profile_id','profile_config_sha256','upload_public_key','upload_key_expires_at_ms']) request[key]=m[key];
        Object.assign(q,{job_id:m.job_id,request_sha256:sha(json(request)),expected_source_bytes:m.expected_source_bytes,
            issued_at_ms:String(nowMs-1000),expires_at_ms:String(nowMs-1000+119123),
            upload_fee_usdc:'1500000',total_fee_usdc:'1600000'});
        q.quote_id=sha(canonical(q));
        q.quote_block_height='1000'; q.max_delegate_block_height='1200'; q.quote_id=sha(canonical(q));
        m.sponsor_quote_signature=sign(null,Buffer.from(canonical(q)),quoteKey.privateKey).toString('base64');
        original.amount=q.total_fee_usdc; original.msg=json(m);
        const codecContext = { network: 'testnet', market: original.receiver_id, creator: context.account, usdc: context.usdc, keyString: raw => `ed25519:${baseEncode(raw)}` };
        const keyBytes = key => PublicKey.fromString(key).data;
        const message = await packCompactUpload(m, keyBytes, codecContext);
        const args = { receiver_id: original.receiver_id, amount: original.amount, msg: message };
        const decoded=await unpackCompactUpload(message, codecContext);
        assert.deepEqual(JSON.parse(json(decoded)),m);
        assert(verify(null,Buffer.from(canonical(decoded.sponsor_quote)),quoteKey.publicKey,Buffer.from(decoded.sponsor_quote_signature,'base64')));
        const tampered={...decoded.sponsor_quote,total_fee_usdc:'1600001'};
        assert(!verify(null,Buffer.from(canonical(tampered)),quoteKey.publicKey,Buffer.from(decoded.sponsor_quote_signature,'base64')));
        assert.equal(context.account,owner.raw.toString('hex'));
        const delegate=buildDelegateAction({senderId:context.account,receiverId:context.usdc,publicKey:context.key,
            nonce:11n,maxBlockHeight:1200n,actions:[actions.functionCall('ft_transfer_call',args,100000000000000n,1n)]});
        const bytes=encodeDelegateAction(delegate);
        const digest=createHash('sha256').update(bytes).digest();
        const delegateSignature = sign(null,digest,owner.privateKey);
        assert(verify(null,digest,owner.publicKey,delegateSignature));
        if (market === 'market.testnet' && seed === 1 && ((name === 'normal' && jobLength === 39) || jobLength === 128)) vectors.push({ request, quote: q, signature: m.sponsor_quote_signature, public_key: quoteKey.raw.toString('base64'), account_public_key: owner.text, normal_message: m, compact_message: message, args, certificate: cert, signed_delegate_base64: Buffer.from(encodeSignedDelegate({ delegateAction: delegate, signature: new Signature({ keyType: 0, data: delegateSignature }) })).toString('base64') });
        let options,fatxn;
        await upstream.exports.onExecutePostLogin({secrets:{ONCHAIN_AUDIENCE:'synthetic',DELEGATE_ACTION_FORM:'test'},resource_server:{identifier:'synthetic'},
            client:{name:'YouTick'},request:{query:{delegateAction:[...bytes].join(',')}}},
            {access:{deny:assert.fail},prompt:{render:(_,v)=>{options=v;}},accessToken:{removeScope(){},setCustomClaim:(_,v)=>{fatxn=[...v];}}});
        assert.deepEqual(fatxn,[...bytes]);
        assert(Buffer.byteLength(json(options.fields))<=24576);
        assert(bytes.length<=4096);
        for (const [envelope,sub,azp,kid] of [
            ['google_shape','google-oauth2|'+'1'.repeat(21),'C'.repeat(32),'K'.repeat(43)],
            ['google_sub_bound','google-oauth2|'+'1'.repeat(255),'C'.repeat(32),'K'.repeat(43)],
            ['app_bounds','g'.repeat(512),'C'.repeat(128),'K'.repeat(43)]
        ]) {
            const payloadBudget = Buffer.from(JSON.stringify({fatxn})).toString('base64url').length + 2048;
            assert(payloadBudget <= 7168, `payload plus reserved envelope exceeds cap: ${payloadBudget}`);
            const now=Math.floor(fixtureTimeMs/1000);
            const jwt=await new SignJWT({iss:issuer,sub,aud,azp,scope:'openid transaction:sign',iat:now,exp:now+60,fatxn})
                .setProtectedHeader({alg:'RS256',typ:'JWT',kid}).sign(rsa.privateKey);
            await jwtVerify(jwt,rsa.publicKey,{issuer,audience:aud[0],algorithms:['RS256'],currentDate:new Date(fixtureTimeMs)});
            const jwtBytes=Buffer.byteLength(jwt);
            const outer64=Buffer.from(json({guard_id:`jwt#${issuer}`,verify_payload:jwt,sign_payload:[...bytes],algorithm:'eddsa'})).toString('base64').length;
            assert(outer64<=32768);
            const encodedArgs=Buffer.from(json(args)).toString('base64');
            assert(encodedArgs.length<=5500);
            const ticket=await new EncryptJWT({sponsor:'sponsor.testnet',accountId:context.account,publicKey:owner.text,nonce:'11',maxBlockHeight:'1200',encodedArgs})
                .setProtectedHeader({alg:'dir',enc:'A256GCM'}).setIssuer('youtick-auth-lab-upload').setAudience('http://localhost:3000').setSubject(sub).setIssuedAt(now).setExpirationTime(now+119).encrypt(new Uint8Array(32).fill(1));
            const bodyBytes=Buffer.byteLength(json({action:'authorize-upload',ticket,token:jwt}));
            assert(ticket.length<=16384); assert(bodyBytes<=32768);
            assert(jwtBytes<=7168, `full JWT exceeds cap: ${jwtBytes}`);
            rows.push({seed,name,jobLength,marketLength:market.length,envelope,encodedArgsBytes:encodedArgs.length,ticketBytes:ticket.length,apiBodyBytes:bodyBytes,payloadWithReservedEnvelope: payloadBudget,delegateBytes:bytes.length,promptFieldsBytes:Buffer.byteLength(json(options.fields)),jwtBytes,jwtFits:jwtBytes<=7168,outer64});
        }
    }
    const evidence=path.resolve(root,'tmp/near-auth-payload-compatibility');
    fs.mkdirSync(evidence,{recursive:true});
    fs.writeFileSync(path.join(evidence,'size-results.json'),JSON.stringify(rows,null,2));
    assert.deepEqual(vectors,JSON.parse(fs.readFileSync(`${root}/protocol/paid-media-livepeer-v1/compact-upload-vectors.json`,'utf8')),'shared fixtures must remain unchanged');
    const summary={scope:'LOCAL_SYNTHETIC_CRYPTO_VALID_NOT_CHAIN_ACCEPTANCE',rows:rows.length,groups:{}};
    for(const type of [...new Set(rows.map(r=>r.envelope))]) {
        const group=rows.filter(r=>r.envelope===type), fails=group.filter(r=>!r.jwtFits);
        summary.groups[type]={cases:group.length,failures:fails.length,maxJwt:Math.max(...group.map(r=>r.jwtBytes)),maxFields:Math.max(...group.map(r=>r.promptFieldsBytes)),maxReserved:Math.max(...group.map(r=>r.payloadWithReservedEnvelope)),firstFailure:fails[0]};
    }
    assert.equal(vectors.length, 6);
    assert(rows.every(r=>r.jwtFits));
    console.log(JSON.stringify(summary,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
