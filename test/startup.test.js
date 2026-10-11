const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');

test('missing token exits with failure instead of advertising a healthy server', () => {
    const child = spawnSync(process.execPath, ['index.js'], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, DISCORD_TOKEN: '' },
        encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /DISCORD_TOKEN est requis/);
    assert.doesNotMatch(child.stdout, /en écoute/);
});

test('invalid port exits before connecting to Discord', () => {
    const child = spawnSync(process.execPath, ['index.js'], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, DISCORD_TOKEN: 'test', PORT: 'not-a-port' },
        encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /PORT doit être/);
});

test('Discord login rejection closes the listening server and exits', async () => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const child = spawnSync(process.execPath, ['-e', `
        const { Client } = require('discord.js');
        Client.prototype.login = async () => { throw new Error('simulated login failure'); };
        require('./index').main().catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        });
    `], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, DISCORD_TOKEN: 'test', PORT: String(port), LIVECHAT_CHANNEL_ID: '' },
        encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 1);
    assert.match(child.stdout, /en écoute/);
    assert.match(child.stderr, /simulated login failure/);
});
