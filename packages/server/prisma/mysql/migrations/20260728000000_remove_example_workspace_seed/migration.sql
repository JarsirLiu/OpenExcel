-- Remove the obsolete example-workspace bootstrap marker.
ALTER TABLE `User` DROP COLUMN `exampleWorkspaceSeededAt`;
