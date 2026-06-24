-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('HOST', 'MODERATOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "ChannelVisibility" AS ENUM ('PUBLIC', 'UNLISTED');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('DRAFT', 'OPEN', 'SUBMISSIONS_CLOSED', 'VOTING_OPEN', 'VOTING_CLOSED', 'RESULTS', 'BATTLE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ResultsVisibility" AS ENUM ('LIVE', 'HIDDEN', 'AFTER_CLOSE');

-- CreateEnum
CREATE TYPE "VoteScope" AS ENUM ('PER_SUBMISSION', 'PER_COMPETITION');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('FILE_MP3', 'FILE_WAV', 'SOUNDCLOUD', 'SPOTIFY', 'OTHER_URL');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED');

-- CreateEnum
CREATE TYPE "TranscodeStatus" AS ENUM ('PENDING', 'DONE', 'FAILED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('PENDING', 'VOTING_OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MatchupStatus" AS ENUM ('PENDING', 'VOTING_OPEN', 'DECIDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "email_verified" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "rules" TEXT,
    "cover_image_url" TEXT,
    "genre" TEXT,
    "host_id" TEXT NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "ChannelVisibility" NOT NULL DEFAULT 'UNLISTED',
    "submission_start_at" TIMESTAMP(3),
    "submission_end_at" TIMESTAMP(3),
    "voting_start_at" TIMESTAMP(3),
    "voting_end_at" TIMESTAMP(3),
    "results_visibility" "ResultsVisibility" NOT NULL DEFAULT 'AFTER_CLOSE',
    "vote_scope" "VoteScope" NOT NULL DEFAULT 'PER_SUBMISSION',
    "max_votes_per_voter" INTEGER NOT NULL DEFAULT 1,
    "allow_guest_votes" BOOLEAN NOT NULL DEFAULT true,
    "require_login_to_vote" BOOLEAN NOT NULL DEFAULT false,
    "allow_guest_uploads" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_members" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT,
    "guest_token" TEXT,
    "display_name" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "submitter_member_id" TEXT NOT NULL,
    "artist_name" TEXT NOT NULL,
    "track_title" TEXT NOT NULL,
    "description" TEXT,
    "source_type" "SourceType" NOT NULL,
    "media_asset_id" TEXT,
    "external_url" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "duration_seconds" INTEGER,
    "original_filename" TEXT,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "transcode_status" "TranscodeStatus" NOT NULL DEFAULT 'PENDING',
    "preview_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "round_id" TEXT,
    "matchup_id" TEXT,
    "voter_user_id" TEXT,
    "ip_hash" TEXT NOT NULL,
    "fingerprint_hash" TEXT,
    "cookie_token" TEXT,
    "user_agent" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battle_rounds" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "round_number" INTEGER NOT NULL,
    "name" TEXT,
    "status" "RoundStatus" NOT NULL DEFAULT 'PENDING',
    "voting_start_at" TIMESTAMP(3),
    "voting_end_at" TIMESTAMP(3),

    CONSTRAINT "battle_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matchups" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "submission_a_id" TEXT NOT NULL,
    "submission_b_id" TEXT,
    "votes_a" INTEGER NOT NULL DEFAULT 0,
    "votes_b" INTEGER NOT NULL DEFAULT 0,
    "winner_submission_id" TEXT,
    "status" "MatchupStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "matchups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "channels_code_key" ON "channels"("code");

-- CreateIndex
CREATE UNIQUE INDEX "channels_slug_key" ON "channels"("slug");

-- CreateIndex
CREATE INDEX "channels_status_idx" ON "channels"("status");

-- CreateIndex
CREATE INDEX "channels_host_id_idx" ON "channels"("host_id");

-- CreateIndex
CREATE INDEX "channels_visibility_status_idx" ON "channels"("visibility", "status");

-- CreateIndex
CREATE INDEX "channel_members_channel_id_idx" ON "channel_members"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channel_id_user_id_key" ON "channel_members"("channel_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channel_id_guest_token_key" ON "channel_members"("channel_id", "guest_token");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_media_asset_id_key" ON "submissions"("media_asset_id");

-- CreateIndex
CREATE INDEX "submissions_channel_id_status_idx" ON "submissions"("channel_id", "status");

-- CreateIndex
CREATE INDEX "votes_channel_id_is_valid_idx" ON "votes"("channel_id", "is_valid");

-- CreateIndex
CREATE INDEX "votes_submission_id_is_valid_idx" ON "votes"("submission_id", "is_valid");

-- CreateIndex
CREATE INDEX "votes_ip_hash_channel_id_idx" ON "votes"("ip_hash", "channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_dedupe_key_key" ON "votes"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "battle_rounds_channel_id_round_number_key" ON "battle_rounds"("channel_id", "round_number");

-- CreateIndex
CREATE INDEX "matchups_round_id_idx" ON "matchups"("round_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitter_member_id_fkey" FOREIGN KEY ("submitter_member_id") REFERENCES "channel_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "battle_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_matchup_id_fkey" FOREIGN KEY ("matchup_id") REFERENCES "matchups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_user_id_fkey" FOREIGN KEY ("voter_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_rounds" ADD CONSTRAINT "battle_rounds_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "battle_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_submission_a_id_fkey" FOREIGN KEY ("submission_a_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_submission_b_id_fkey" FOREIGN KEY ("submission_b_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_winner_submission_id_fkey" FOREIGN KEY ("winner_submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
