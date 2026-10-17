const express = require('express');
const { creditQuizResponse, creditReferrals } = require('./index');

const router = express.Router();
router.use('/api/v2/test/actions', (req, res, next) => {
  if (process.env.NODE_ENV !== 'test' || !process.env.V2_TEST_TOKEN ||
      req.headers['x-v2-test-token'] !== process.env.V2_TEST_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});
router.post('/api/v2/test/actions/quiz', (req, res) => {
  try { res.json(creditQuizResponse(req.body?.poll, req.body?.response)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
router.post('/api/v2/test/actions/referrals', (req, res) => {
  try { res.json(creditReferrals(req.body?.referrerId, req.body?.referrals)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

module.exports = router;
