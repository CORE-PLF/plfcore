-- Token opaco por instalaÃ§Ã£o. O valor em claro existe somente no aplicativo,
-- protegido pelo DPAPI do Windows; o servidor persiste apenas o SHA-256.
ALTER TABLE `LicenseDevice`
  ADD COLUMN `tokenHash` VARCHAR(191) NULL,
  ADD COLUMN `tokenIssuedAt` DATETIME(3) NULL,
  ADD COLUMN `tokenLastUsedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `LicenseDevice_tokenHash_key` ON `LicenseDevice`(`tokenHash`);
