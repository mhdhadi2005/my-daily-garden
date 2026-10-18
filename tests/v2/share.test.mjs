import test from 'node:test';
import assert from 'node:assert/strict';
import { renderShareCard } from '../../public/v2/share.mjs';

const valid = {
  mode: 'verified',
  forestImage: 'data:image/png;base64,AAAA',
  subscriberSinceYear: 2020,
  opens: 170,
  clicks: 100,
  trees: 6,
  latestMilestone: 'Woodland unlocked',
  coverage: { opensFromYear: 2020, opensComplete: true, clicksFromYear: 2024, clicksComplete: false },
};

test('real share card rejects unverified or incomplete source data before drawing', async () => {
  await assert.rejects(() => renderShareCard({ ...valid, mode: 'unverified' }), /verified|sample/i);
  await assert.rejects(() => renderShareCard({ ...valid, opens: null }), /opens/i);
  await assert.rejects(() => renderShareCard({ ...valid, subscriberSinceYear: null }), /subscriber/i);
  await assert.rejects(() => renderShareCard({ ...valid, coverage: { opensFromYear: 2020 } }), /clicks.*coverage/i);
  await assert.rejects(() => renderShareCard({ ...valid, coverage: { ...valid.coverage, clicksComplete: undefined } }), /clicks.*coverage/i);
  await assert.rejects(() => renderShareCard({ ...valid, forestImage: 'data:image/svg+xml;utf8,%3Csvg/%3E' }), /png/i);
});
