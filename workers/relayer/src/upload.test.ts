import { describe, expect, it } from 'vitest';
import vectors from '../../../protocol/youtick-market-v2/golden-vectors.json';
import { parseUploadFields, parseUploadKeyFields, uploadDelegate, uploadKeyDelegate } from './upload';

const upload = vectors.upload;
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

describe('upload delegates against the protocol vectors', () => {
    it('rebuilds the upload fee delegate byte for byte', () => {
        const vector = upload.delegate;
        const fields = parseUploadFields({ args: vector.args, nonce: vector.nonce, max_block_height: vector.max_block_height }, vectors.fixture.contract_id);
        expect(fields.jobId).toBe(vectors.fixture.upload_job_id);
        const { bytes } = uploadDelegate({ senderId: vector.sender_id, publicKey: vector.public_key, usdcContractId: vector.receiver_id, fields });
        expect(bytes.length).toBe(vector.byte_length);
        expect(b64(bytes)).toBe(vector.bytes_base64);
    });

    it('rebuilds the replace_upload_key delegate byte for byte', () => {
        const vector = upload.replace_upload_key.delegate;
        const fields = parseUploadKeyFields({ args: vector.args, nonce: vector.nonce, max_block_height: vector.max_block_height });
        const { bytes } = uploadKeyDelegate({ senderId: vector.sender_id, publicKey: vector.public_key, marketContractId: vector.receiver_id, fields });
        expect(bytes.length).toBe(vector.byte_length);
        expect(b64(bytes)).toBe(vector.bytes_base64);
    });

    it('accepts only the exact field shapes', () => {
        const vector = upload.delegate;
        const good = { args: vector.args, nonce: vector.nonce, max_block_height: vector.max_block_height };
        expect(() => parseUploadFields(good, 'other.testnet')).toThrow('invalid_request');
        expect(() => parseUploadFields({ ...good, extra: 1 }, vectors.fixture.contract_id)).toThrow('invalid_request');
        expect(() => parseUploadFields({ ...good, args: { ...vector.args, memo: 'x' } }, vectors.fixture.contract_id)).toThrow('invalid_request');
        expect(() => parseUploadFields({ ...good, args: { ...vector.args, msg: JSON.stringify({ action: 'buy_ticket_v2' }) } }, vectors.fixture.contract_id))
            .toThrow('invalid_request');
        expect(() => parseUploadFields({ ...good, nonce: '0' }, vectors.fixture.contract_id)).toThrow('invalid_request');
        const key = upload.replace_upload_key.delegate;
        const goodKey = { args: key.args, nonce: key.nonce, max_block_height: key.max_block_height };
        expect(parseUploadKeyFields(goodKey)).toEqual(goodKey);
        expect(() => parseUploadKeyFields({ ...goodKey, args: { ...key.args, new_public_key: 'ed25519:short' } })).toThrow('invalid_request');
        expect(() => parseUploadKeyFields({ ...goodKey, args: { job_id: key.args.job_id, expires_at_ms: key.args.expires_at_ms, new_public_key: key.args.new_public_key } }))
            .toThrow('invalid_request');
    });
});
