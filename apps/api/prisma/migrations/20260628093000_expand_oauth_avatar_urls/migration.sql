ALTER TABLE `profiles`
  MODIFY COLUMN `avatarUrl` TEXT NULL;

ALTER TABLE `oauth_accounts`
  MODIFY COLUMN `avatarUrl` TEXT NULL;
