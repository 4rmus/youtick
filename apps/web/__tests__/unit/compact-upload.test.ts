import { it, expect, vi } from 'vitest';
import { PublicKey, baseEncode } from 'near-api-js';
import { packCompactUpload, unpackCompactUpload } from '../../../../protocol/paid-media-livepeer-v1/compact-upload';
import vectors from '../../../../protocol/paid-media-livepeer-v1/compact-upload-vectors.json';
vi.unmock('near-api-js');
const fixture = vectors[0];
const context = { network: 'testnet', market: 'market.testnet', creator: fixture.request.creator_id,
    usdc: fixture.quote.delegate_receiver_id, keyString: (bytes: Uint8Array) => `ed25519:${baseEncode(bytes)}` };
const keyBytes = (key: string) => PublicKey.fromString(key).data;

it.each(vectors)('preserves exact fields and actual short quote lifetime: $request.title', async vector => {
    expect(await unpackCompactUpload(vector.compact_message, context)).toEqual(vector.normal_message);
    expect(await packCompactUpload(vector.normal_message, keyBytes, context)).toBe(vector.compact_message);
    expect(Number(vector.quote.expires_at_ms)-Number(vector.quote.issued_at_ms)).toBe(119123);
});

it.each(['version', 'trailing', 'truncated', 'profile', 'utf8', 'length', 'price', 'base64'])('rejects malformed compact input: %s', async problem => {
    const data=Buffer.from(fixture.compact_message.slice(6),'base64');
    let value=fixture.compact_message;
    const titleOffset=4+data.readUInt32LE(0);
    const titleLength=data.readUInt32LE(titleOffset);
    const priceOffset=titleOffset+4+titleLength;
    if(problem==='version') value=value.replace('yt:u1:','yt:u2:');
    if(problem==='trailing') value='yt:u1:'+Buffer.concat([data,Buffer.from([0])]).toString('base64');
    if(problem==='truncated') value='yt:u1:'+data.subarray(0,-1).toString('base64');
    if(problem==='profile') { data[priceOffset+16+8]=3; value='yt:u1:'+data.toString('base64'); }
    if(problem==='utf8') { data[titleOffset+4]=255; value='yt:u1:'+data.toString('base64'); }
    if(problem==='length') { data.writeUInt32LE(0xffffffff,0); value='yt:u1:'+data.toString('base64'); }
    if(problem==='price') { data.fill(255,priceOffset,priceOffset+16); value='yt:u1:'+data.toString('base64'); }
    if(problem==='base64') value+='\n';
    await expect(unpackCompactUpload(value,context)).rejects.toThrow();
});

it.each(['extra', 'missing', 'surrogate', 'quote', 'device', 'identity'])('does not silently change reviewed fields: %s', async problem => {
    const value: Record<string, unknown>=structuredClone(fixture.normal_message);
    if(problem==='extra') value.extra=true;
    if(problem==='missing') delete value.price_usdc;
    if(problem==='surrogate') value.title='bad\ud800';
    if(problem==='quote') (value.sponsor_quote as Record<string, unknown>).total_fee_usdc='1';
    if(problem==='device') (value.playback_session as Record<string, unknown>).authorization_duration_ms='1';
    if(problem==='identity') value.creator_id='other.testnet';
    await expect(packCompactUpload(value,keyBytes,context)).rejects.toThrow();
});
