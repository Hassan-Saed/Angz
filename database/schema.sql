-- ========================================================
-- Angz (أنجز) - Production MySQL Database Schema & Seed Data
-- Database Version: 1.0.0
-- Charset: utf8mb4 / utf8mb4_0900_ai_ci
-- ========================================================

CREATE DATABASE IF NOT EXISTS `angz` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `angz`;

-- --------------------------------------------------------
-- Table: users
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `avatar_url` TEXT NULL,
    `subscription_status` ENUM('free', 'trial', 'premium') NOT NULL DEFAULT 'trial',
    `trial_ends_at` DATETIME NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'ar',
    -- Records when the address last changed so a reset sent to a not-yet-verified
    -- address can be rejected.
    `email_changed_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- `email_changed_at` is declared inline in the CREATE TABLE above.
-- Note: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is MariaDB syntax; MySQL 8
-- rejects it and aborts the remainder of the script, which is why no such
-- statement appears here. Existing databases pick the column up via
-- `node tools/migrate.js`.

-- --------------------------------------------------------
-- Table: user_settings
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_settings` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT UNSIGNED NOT NULL UNIQUE,
    `theme` ENUM('light', 'dark', 'system') NOT NULL DEFAULT 'system',
    `push_enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `due_soon_reminder_minutes` INT UNSIGNED NOT NULL DEFAULT 60,
    `daily_summary_enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `ai_persona` VARCHAR(64) NOT NULL DEFAULT 'balanced',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Table: tasks
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tasks` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT UNSIGNED NOT NULL,
    -- WIDENED from VARCHAR(255): `title` and `description` hold AES-256-GCM
    -- ciphertext, which hex-encodes at 2 chars per byte plus 66 chars of IV
    -- and auth tag. A 200-character title encrypts to ~466 characters, and an
    -- Arabic title (2 bytes/char) to ~866. At VARCHAR(255) any title over 94
    -- characters overflowed, which truncated the ciphertext and made the task
    -- permanently undecryptable. VARCHAR(1000) covers 200 characters in any
    -- script with room to spare.
    `title` VARCHAR(1000) NOT NULL,
    `description` TEXT NULL,
    `status` ENUM('todo', 'in_progress', 'done', 'archived') NOT NULL DEFAULT 'todo',
    `priority` ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
    `due_date` DATE NULL,
    `position` INT UNSIGNED NOT NULL DEFAULT 0,
    `media_url` TEXT NULL,
    `media_name` VARCHAR(255) NULL,
    `media_size_bytes` BIGINT UNSIGNED NULL,
    `completed_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_tasks_user_status` (`user_id`, `status`),
    INDEX `idx_tasks_user_due` (`user_id`, `due_date`),
    INDEX `idx_tasks_user_priority` (`user_id`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Table: ai_conversations
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_conversations` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `prompt` TEXT NOT NULL,
    `response` TEXT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_conv_user_created` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Table: ai_messages
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_messages` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `role` ENUM('user', 'assistant', 'system') NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_ai_messages_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Table: media
--
-- One row per uploaded file (profile pictures, task attachments).
-- The `path` is server-generated and relative; the original filename supplied
-- by the client is kept only as a display label and is never used to build a
-- filesystem path.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `media` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `kind` ENUM('avatar', 'attachment') NOT NULL DEFAULT 'attachment',
    `original_name` VARCHAR(255) NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_media_user_kind` (`user_id`, `kind`),
    INDEX `idx_media_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------
-- Table: password_resets
--
-- Only the SHA-256 hash of the reset token is stored, so a leaked database
-- dump cannot be used to take over accounts. Tokens are single-use: `used_at`
-- is stamped on redemption, and every active token is invalidated whenever the
-- password changes.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `password_resets` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `used_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uq_password_resets_token` (`token_hash`),
    INDEX `idx_password_resets_user` (`user_id`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ========================================================
-- SEED DATA FOR TESTING & INITIAL SETUP
--
-- The demo account's password is "password123".
-- The hash below is generated fresh from that password. The previously
-- committed value was a placeholder copied from a bcrypt example and did not
-- verify against "password123" (or anything else), so demo@angz.local could
-- never actually be logged into.
-- ========================================================

INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `avatar_url`, `subscription_status`, `trial_ends_at`, `locale`) 
VALUES (
    1, 
    'أحمد علي', 
    'demo@angz.local', 
    '$2b$10$.wgXE3vyhetmdefpMWWZ6.kO2P0hmFuUzo.rLphVlikT306zBe.ju', 
    NULL, 
    'trial', 
    DATE_ADD(NOW(), INTERVAL 14 DAY), 
    'ar'
) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `user_settings` (`user_id`, `theme`, `push_enabled`, `due_soon_reminder_minutes`, `daily_summary_enabled`, `ai_persona`)
VALUES (1, 'system', 1, 60, 1, 'balanced')
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

INSERT INTO `tasks` (`id`, `user_id`, `title`, `description`, `status`, `priority`, `due_date`, `position`) VALUES
(1, 1, 'إعداد عرض مشروع أنجز النهاية', 'مراجعة كافة الواجهات والخدمات والتأكد من دعم الهواتف المحمولة والتخزين في قاعدة البيانات', 'in_progress', 'urgent', CURDATE(), 1),
(2, 1, 'تصميم واجهة المستخدم Responsive', 'ضبط المقاسات والشاشات للأجهزة الذكية والأجهزة اللوحية وتجربة RTL', 'done', 'high', CURDATE(), 2),
(3, 1, 'ربط APIs قاعدة البيانات MySQL', 'إنشاء واستدعاء كافة APIs الخاصة بالمهام والذكاء الاصطناعي والمستخدمين', 'in_progress', 'high', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 3),
(4, 1, 'اختبار المساعد الذكي AI Agent', 'التأكد من حفظ المحادثات واقتراح خطة العمل اليومية بشكل تلقائي', 'todo', 'medium', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 4)
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);

INSERT INTO `ai_messages` (`user_id`, `role`, `content`) VALUES
(1, 'assistant', 'مرحبًا بك! أنا مساعدك الذكي في أنجز. كيف يمكنني مساعدتك في تنظيم أهدافك ومهامك اليوم؟')
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`);
