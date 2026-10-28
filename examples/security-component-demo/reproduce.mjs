import assert from 'node:assert/strict';
import { vulnerableRead, authorizedRead } from './invoices.mjs';
const actual = vulnerableRead('alice', 'inv-bob');
assert.equal(actual.owner, 'bob');
assert.deepEqual(authorizedRead('alice', 'inv-bob'), { error: 'forbidden' });
assert.equal(authorizedRead('alice', 'inv-alice').owner, 'alice');
console.log(JSON.stringify({ actor: 'alice', target: 'inv-bob', vulnerableResult: actual, authorizedResult: authorizedRead('alice', 'inv-bob'), ownInvoice: authorizedRead('alice', 'inv-alice'), result: '3 assertions passed; cross-owner disclosure reproduced' }, null, 2));
