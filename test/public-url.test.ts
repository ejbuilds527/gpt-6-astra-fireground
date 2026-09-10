import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicOrigin,publicRedirect} from '../lib/public-url';
test('Cloud Run bind address never becomes the callback origin',()=>{
 const headers=new Headers({'x-forwarded-proto':'https','x-forwarded-host':'fireground.meerkatops.app',host:'0.0.0.0:8080'});
 assert.equal(publicOrigin(headers),'https://fireground.meerkatops.app');
 assert.equal(publicRedirect('http://0.0.0.0:8080/app?role=command',headers).href,'https://fireground.meerkatops.app/app?role=command');
 assert.equal(publicRedirect('/signin',headers).href,'https://fireground.meerkatops.app/signin');
});
test('untrusted origins fall back to the public site; local preview retains its port',()=>{
 assert.equal(publicOrigin(new Headers({host:'attacker.example'})),'https://fireground.meerkatops.app');
 assert.equal(publicOrigin(new Headers({host:'0.0.0.0:8080'})),'https://fireground.meerkatops.app');
 assert.equal(publicOrigin(new Headers({host:'localhost:3001','x-forwarded-proto':'http'})),'http://localhost:3001');
});
