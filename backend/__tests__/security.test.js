const test = require('node:test');
const assert = require('node:assert/strict');
const { HOST, isLocalOrigin, corsOptions } = require('../security');

test('backend usa exclusivamente o endereço de loopback IPv4', () => {
    assert.equal(HOST, '127.0.0.1');
});

test('CORS reconhece apenas origens HTTP locais', () => {
    assert.equal(isLocalOrigin('http://localhost:3000'), true);
    assert.equal(isLocalOrigin('http://127.0.0.1:3000'), true);
    assert.equal(isLocalOrigin('https://example.com'), false);
    assert.equal(isLocalOrigin('http://192.168.1.10:3000'), false);
    assert.equal(isLocalOrigin('not-a-url'), false);
});

test('CORS não libera uma origem externa', async () => {
    await new Promise(resolve => {
        corsOptions.origin('https://example.com', error => {
            assert.ok(error);
            resolve();
        });
    });
});

test('CORS permite requisições sem Origin e origem local padrão', async () => {
    for (const origin of [undefined, 'http://localhost:3000', 'http://127.0.0.1:3000']) {
        await new Promise((resolve, reject) => {
            corsOptions.origin(origin, (error, allowed) => {
                if (error) return reject(error);
                assert.equal(allowed, true);
                resolve();
            });
        });
    }
});
