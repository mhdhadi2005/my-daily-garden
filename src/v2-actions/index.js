const { ensureGarden, creditGarden } = require('../v2/garden');

function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 180 && /^[a-zA-Z0-9_-]+$/.test(id);
}

// shortcut: source-shaped records are fixture-only until a live Beehiiv poll/referral contract check.
function creditQuizResponse(poll, response) {
  if (!validId(poll?.id) || !validId(response?.subscription_id) ||
      !validId(response?.poll_choice_id)) throw new TypeError('invalid quiz evidence');
  const approved = (process.env.V2_APPROVED_QUIZ_IDS || '').split(',').map(id => id.trim());
  if (approved.includes(poll.id) && poll.status === 'published' && poll.poll_type === 'trivia' &&
      response.subscription_deleted === false &&
      poll.trivia_answer === response.poll_choice_id) {
    return creditGarden(response.subscription_id, `quiz:${poll.id}`, 15);
  }
  return ensureGarden(response.subscription_id);
}

// `referrals` must come from Beehiiv's expand[]=referrals response for referrerId.
function creditReferrals(referrerId, referrals) {
  if (!validId(referrerId) || !Array.isArray(referrals) ||
      referrals.some(referral => !validId(referral?.id) ||
        !['active', 'pending', 'inactive', 'unsubscribed'].includes(referral.status))) {
    throw new TypeError('invalid referral evidence');
  }
  for (const referral of referrals) {
    if (referral.status === 'active' && referral.id !== referrerId) {
      creditGarden(referrerId, `referral:${referral.id}`, 50);
    }
  }
  return ensureGarden(referrerId);
}

module.exports = { creditQuizResponse, creditReferrals };
