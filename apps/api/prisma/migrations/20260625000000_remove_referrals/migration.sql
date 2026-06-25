-- Drop referral feature data and schema.
DROP TABLE IF EXISTS `referral_reward_transfers`;
DROP TABLE IF EXISTS `referral_invitations`;

DELETE FROM `navigation_menu_items`
WHERE `area` = 'DASHBOARD_SIDEBAR'
  AND (`code` = 'referrals' OR `href` = '/dashboard/referrals');

DELETE FROM `site_settings`
WHERE `key` IN ('referrals.rewardCredits', 'referrals.autoApproveTransferLimit')
   OR `scope` = 'referrals';

ALTER TABLE `profiles`
  DROP INDEX `profiles_referralCode_key`,
  DROP COLUMN `referralCode`,
  DROP COLUMN `referralRewardCredits`,
  DROP COLUMN `referralRewardTotalCredits`;
