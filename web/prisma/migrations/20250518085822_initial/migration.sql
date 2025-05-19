-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'HUMAN_PENDING', 'APPROVED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderIdStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('COMMUNITY_CONTRIBUTED', 'APPROVED', 'VERIFICATION_SUCCESS', 'VERIFICATION_FAILED');

-- CreateEnum
CREATE TYPE "ServiceInfoBanner" AS ENUM ('NONE', 'NO_LONGER_OPERATIONAL');

-- CreateEnum
CREATE TYPE "ServiceVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('MONERO', 'BITCOIN', 'LIGHTNING', 'FIAT', 'CASH');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('WARNING', 'WARNING_SOLVED', 'ALERT', 'ALERT_SOLVED', 'INFO', 'NORMAL', 'UPDATE');

-- CreateEnum
CREATE TYPE "ServiceUserRole" AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "AccountStatusChange" AS ENUM ('ADMIN_TRUE', 'ADMIN_FALSE', 'VERIFIED_TRUE', 'VERIFIED_FALSE', 'VERIFIER_TRUE', 'VERIFIER_FALSE', 'SPAMMER_TRUE', 'SPAMMER_FALSE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMMENT_STATUS_CHANGE', 'REPLY_COMMENT_CREATED', 'COMMUNITY_NOTE_ADDED', 'ROOT_COMMENT_CREATED', 'SUGGESTION_MESSAGE', 'SUGGESTION_STATUS_CHANGE', 'ACCOUNT_STATUS_CHANGE', 'EVENT_CREATED', 'SERVICE_VERIFICATION_STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "CommentStatusChange" AS ENUM ('MARKED_AS_SPAM', 'UNMARKED_AS_SPAM', 'MARKED_FOR_ADMIN_REVIEW', 'UNMARKED_FOR_ADMIN_REVIEW', 'STATUS_CHANGED_TO_APPROVED', 'STATUS_CHANGED_TO_VERIFIED', 'STATUS_CHANGED_TO_REJECTED', 'STATUS_CHANGED_TO_PENDING');

-- CreateEnum
CREATE TYPE "ServiceVerificationStatusChange" AS ENUM ('STATUS_CHANGED_TO_COMMUNITY_CONTRIBUTED', 'STATUS_CHANGED_TO_APPROVED', 'STATUS_CHANGED_TO_VERIFICATION_SUCCESS', 'STATUS_CHANGED_TO_VERIFICATION_FAILED');

-- CreateEnum
CREATE TYPE "ServiceSuggestionStatusChange" AS ENUM ('STATUS_CHANGED_TO_PENDING', 'STATUS_CHANGED_TO_APPROVED', 'STATUS_CHANGED_TO_REJECTED', 'STATUS_CHANGED_TO_WITHDRAWN');

-- CreateEnum
CREATE TYPE "ServiceSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ServiceSuggestionType" AS ENUM ('CREATE_SERVICE', 'EDIT_SERVICE');

-- CreateEnum
CREATE TYPE "AttributeCategory" AS ENUM ('PRIVACY', 'TRUST');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('GOOD', 'BAD', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "VerificationStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED');

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDING',
    "suspicious" BOOLEAN NOT NULL DEFAULT false,
    "requiresAdminReview" BOOLEAN NOT NULL DEFAULT false,
    "communityNote" TEXT,
    "verificationNote" TEXT,
    "internalNote" TEXT,
    "privateContext" TEXT,
    "orderId" VARCHAR(100),
    "orderIdStatus" "OrderIdStatus" DEFAULT 'PENDING',
    "kycRequested" BOOLEAN NOT NULL DEFAULT false,
    "fundsBlocked" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL,
    "rating" SMALLINT,
    "ratingActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "parentId" INTEGER,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aboutCommentId" INTEGER,
    "aboutEventId" INTEGER,
    "aboutServiceId" INTEGER,
    "aboutServiceSuggestionId" INTEGER,
    "aboutServiceSuggestionMessageId" INTEGER,
    "aboutAccountStatusChange" "AccountStatusChange",
    "aboutCommentStatusChange" "CommentStatusChange",
    "aboutServiceVerificationStatusChange" "ServiceVerificationStatusChange",
    "aboutSuggestionStatusChange" "ServiceSuggestionStatusChange",

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreferences" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "enableOnMyCommentStatusChange" BOOLEAN NOT NULL DEFAULT true,
    "enableAutowatchMyComments" BOOLEAN NOT NULL DEFAULT true,
    "enableNotifyPendingRepliesOnWatch" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreferenceOnServiceVerificationChangeFilterFilter" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStepStatus" NOT NULL,
    "notificationPreferencesId" INTEGER NOT NULL,
    "currencies" "Currency"[],
    "scores" INTEGER[],

    CONSTRAINT "NotificationPreferenceOnServiceVerificationChangeFilterFil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "type" "EventType" NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceId" INTEGER NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSuggestion" (
    "id" SERIAL NOT NULL,
    "type" "ServiceSuggestionType" NOT NULL,
    "status" "ServiceSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,

    CONSTRAINT "ServiceSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSuggestionMessage" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "suggestionId" INTEGER NOT NULL,

    CONSTRAINT "ServiceSuggestionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kycLevel" INTEGER NOT NULL DEFAULT 4,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "privacyScore" INTEGER NOT NULL DEFAULT 0,
    "trustScore" INTEGER NOT NULL DEFAULT 0,
    "isRecentlyListed" BOOLEAN NOT NULL DEFAULT false,
    "averageUserRating" DOUBLE PRECISION,
    "serviceVisibility" "ServiceVisibility" NOT NULL DEFAULT 'PUBLIC',
    "serviceInfoBanner" "ServiceInfoBanner" NOT NULL DEFAULT 'NONE',
    "serviceInfoBannerNotes" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'COMMUNITY_CONTRIBUTED',
    "verificationSummary" TEXT,
    "verificationProofMd" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "userSentiment" JSONB,
    "userSentimentAt" TIMESTAMP(3),
    "referral" TEXT,
    "acceptedCurrencies" "Currency"[] DEFAULT ARRAY[]::"Currency"[],
    "serviceUrls" TEXT[],
    "tosUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onionUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "i2pUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "tosReview" JSONB,
    "tosReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceContactMethod" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "iconId" TEXT NOT NULL,
    "info" TEXT NOT NULL,
    "serviceId" INTEGER NOT NULL,

    CONSTRAINT "ServiceContactMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribute" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "privacyPoints" INTEGER NOT NULL DEFAULT 0,
    "trustPoints" INTEGER NOT NULL DEFAULT 0,
    "category" "AttributeCategory" NOT NULL,
    "type" "AttributeType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalUserNote" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "addedByUserId" INTEGER,

    CONSTRAINT "InternalUserNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "link" TEXT,
    "picture" TEXT,
    "spammer" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "admin" BOOLEAN NOT NULL DEFAULT false,
    "verifier" BOOLEAN NOT NULL DEFAULT false,
    "verifiedLink" TEXT,
    "secretTokenHash" TEXT NOT NULL,
    "totalKarma" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentVote" (
    "id" SERIAL NOT NULL,
    "downvote" BOOLEAN NOT NULL DEFAULT false,
    "commentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAttribute" (
    "serviceId" INTEGER NOT NULL,
    "attributeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAttribute_pkey" PRIMARY KEY ("serviceId","attributeId")
);

-- CreateTable
CREATE TABLE "KarmaTransaction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "commentId" INTEGER,
    "suggestionId" INTEGER,
    "description" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KarmaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationStep" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "VerificationStepStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceMd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceId" INTEGER NOT NULL,

    CONSTRAINT "VerificationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVerificationRequest" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceScoreRecalculationJob" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceScoreRecalculationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceUser" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "role" "ServiceUserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_watchedComments" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_watchedComments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_onEventCreatedForServices" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_onEventCreatedForServices_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_onRootCommentCreatedForServices" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_onRootCommentCreatedForServices_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_onVerificationChangeForServices" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_onVerificationChangeForServices_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AttributeToNotificationPreferenceOnServiceVerificationChangeFi" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_AttributeToNotificationPreferenceOnServiceVerification_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ServiceToCategory" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ServiceToCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CategoryToNotificationPreferenceOnServiceVerificationChangeFil" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CategoryToNotificationPreferenceOnServiceVerificationC_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Comment_status_idx" ON "Comment"("status");

-- CreateIndex
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");

-- CreateIndex
CREATE INDEX "Comment_serviceId_idx" ON "Comment"("serviceId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "Comment_upvotes_idx" ON "Comment"("upvotes");

-- CreateIndex
CREATE INDEX "Comment_rating_idx" ON "Comment"("rating");

-- CreateIndex
CREATE INDEX "Comment_ratingActive_idx" ON "Comment"("ratingActive");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_serviceId_orderId_key" ON "Comment"("serviceId", "orderId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_type_aboutCommentId_idx" ON "Notification"("userId", "type", "aboutCommentId");

-- CreateIndex
CREATE INDEX "idx_notification_suggestion_message" ON "Notification"("userId", "type", "aboutServiceSuggestionMessageId");

-- CreateIndex
CREATE INDEX "idx_notification_suggestion_status" ON "Notification"("userId", "type", "aboutServiceSuggestionId");

-- CreateIndex
CREATE INDEX "idx_notification_account_status" ON "Notification"("userId", "type", "aboutAccountStatusChange");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferences_userId_key" ON "NotificationPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreferenceOnServiceVerificationChangeFilterFilt_key" ON "NotificationPreferenceOnServiceVerificationChangeFilterFilter"("verificationStatus", "notificationPreferencesId");

-- CreateIndex
CREATE INDEX "Event_visible_idx" ON "Event"("visible");

-- CreateIndex
CREATE INDEX "Event_startedAt_idx" ON "Event"("startedAt");

-- CreateIndex
CREATE INDEX "Event_createdAt_idx" ON "Event"("createdAt");

-- CreateIndex
CREATE INDEX "Event_endedAt_idx" ON "Event"("endedAt");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "Event_serviceId_idx" ON "Event"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceSuggestion_userId_idx" ON "ServiceSuggestion"("userId");

-- CreateIndex
CREATE INDEX "ServiceSuggestion_serviceId_idx" ON "ServiceSuggestion"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceSuggestionMessage_userId_idx" ON "ServiceSuggestionMessage"("userId");

-- CreateIndex
CREATE INDEX "ServiceSuggestionMessage_suggestionId_idx" ON "ServiceSuggestionMessage"("suggestionId");

-- CreateIndex
CREATE INDEX "ServiceSuggestionMessage_createdAt_idx" ON "ServiceSuggestionMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE INDEX "Service_listedAt_idx" ON "Service"("listedAt");

-- CreateIndex
CREATE INDEX "Service_overallScore_idx" ON "Service"("overallScore");

-- CreateIndex
CREATE INDEX "Service_privacyScore_idx" ON "Service"("privacyScore");

-- CreateIndex
CREATE INDEX "Service_trustScore_idx" ON "Service"("trustScore");

-- CreateIndex
CREATE INDEX "Service_averageUserRating_idx" ON "Service"("averageUserRating");

-- CreateIndex
CREATE INDEX "Service_name_idx" ON "Service"("name");

-- CreateIndex
CREATE INDEX "Service_verificationStatus_idx" ON "Service"("verificationStatus");

-- CreateIndex
CREATE INDEX "Service_kycLevel_idx" ON "Service"("kycLevel");

-- CreateIndex
CREATE INDEX "Service_createdAt_idx" ON "Service"("createdAt");

-- CreateIndex
CREATE INDEX "Service_updatedAt_idx" ON "Service"("updatedAt");

-- CreateIndex
CREATE INDEX "Service_slug_idx" ON "Service"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Attribute_slug_key" ON "Attribute"("slug");

-- CreateIndex
CREATE INDEX "InternalUserNote_userId_idx" ON "InternalUserNote"("userId");

-- CreateIndex
CREATE INDEX "InternalUserNote_addedByUserId_idx" ON "InternalUserNote"("addedByUserId");

-- CreateIndex
CREATE INDEX "InternalUserNote_createdAt_idx" ON "InternalUserNote"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_secretTokenHash_key" ON "User"("secretTokenHash");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_totalKarma_idx" ON "User"("totalKarma");

-- CreateIndex
CREATE INDEX "CommentVote_commentId_idx" ON "CommentVote"("commentId");

-- CreateIndex
CREATE INDEX "CommentVote_userId_idx" ON "CommentVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentVote_commentId_userId_key" ON "CommentVote"("commentId", "userId");

-- CreateIndex
CREATE INDEX "KarmaTransaction_createdAt_idx" ON "KarmaTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "KarmaTransaction_userId_idx" ON "KarmaTransaction"("userId");

-- CreateIndex
CREATE INDEX "KarmaTransaction_processed_idx" ON "KarmaTransaction"("processed");

-- CreateIndex
CREATE INDEX "KarmaTransaction_suggestionId_idx" ON "KarmaTransaction"("suggestionId");

-- CreateIndex
CREATE INDEX "KarmaTransaction_commentId_idx" ON "KarmaTransaction"("commentId");

-- CreateIndex
CREATE INDEX "VerificationStep_serviceId_idx" ON "VerificationStep"("serviceId");

-- CreateIndex
CREATE INDEX "VerificationStep_status_idx" ON "VerificationStep"("status");

-- CreateIndex
CREATE INDEX "VerificationStep_createdAt_idx" ON "VerificationStep"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_name_idx" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "ServiceVerificationRequest_serviceId_idx" ON "ServiceVerificationRequest"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceVerificationRequest_userId_idx" ON "ServiceVerificationRequest"("userId");

-- CreateIndex
CREATE INDEX "ServiceVerificationRequest_createdAt_idx" ON "ServiceVerificationRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceVerificationRequest_serviceId_userId_key" ON "ServiceVerificationRequest"("serviceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceScoreRecalculationJob_serviceId_key" ON "ServiceScoreRecalculationJob"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceScoreRecalculationJob_processedAt_idx" ON "ServiceScoreRecalculationJob"("processedAt");

-- CreateIndex
CREATE INDEX "ServiceScoreRecalculationJob_createdAt_idx" ON "ServiceScoreRecalculationJob"("createdAt");

-- CreateIndex
CREATE INDEX "ServiceUser_userId_idx" ON "ServiceUser"("userId");

-- CreateIndex
CREATE INDEX "ServiceUser_serviceId_idx" ON "ServiceUser"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceUser_role_idx" ON "ServiceUser"("role");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceUser_userId_serviceId_key" ON "ServiceUser"("userId", "serviceId");

-- CreateIndex
CREATE INDEX "_watchedComments_B_index" ON "_watchedComments"("B");

-- CreateIndex
CREATE INDEX "_onEventCreatedForServices_B_index" ON "_onEventCreatedForServices"("B");

-- CreateIndex
CREATE INDEX "_onRootCommentCreatedForServices_B_index" ON "_onRootCommentCreatedForServices"("B");

-- CreateIndex
CREATE INDEX "_onVerificationChangeForServices_B_index" ON "_onVerificationChangeForServices"("B");

-- CreateIndex
CREATE INDEX "_AttributeToNotificationPreferenceOnServiceVerification_B_index" ON "_AttributeToNotificationPreferenceOnServiceVerificationChangeFi"("B");

-- CreateIndex
CREATE INDEX "_ServiceToCategory_B_index" ON "_ServiceToCategory"("B");

-- CreateIndex
CREATE INDEX "_CategoryToNotificationPreferenceOnServiceVerificationC_B_index" ON "_CategoryToNotificationPreferenceOnServiceVerificationChangeFil"("B");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aboutCommentId_fkey" FOREIGN KEY ("aboutCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aboutEventId_fkey" FOREIGN KEY ("aboutEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aboutServiceId_fkey" FOREIGN KEY ("aboutServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aboutServiceSuggestionId_fkey" FOREIGN KEY ("aboutServiceSuggestionId") REFERENCES "ServiceSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_aboutServiceSuggestionMessageId_fkey" FOREIGN KEY ("aboutServiceSuggestionMessageId") REFERENCES "ServiceSuggestionMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreferences" ADD CONSTRAINT "NotificationPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreferenceOnServiceVerificationChangeFilterFilter" ADD CONSTRAINT "NotificationPreferenceOnServiceVerificationChangeFilterFil_fkey" FOREIGN KEY ("notificationPreferencesId") REFERENCES "NotificationPreferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestion" ADD CONSTRAINT "ServiceSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestion" ADD CONSTRAINT "ServiceSuggestion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestionMessage" ADD CONSTRAINT "ServiceSuggestionMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestionMessage" ADD CONSTRAINT "ServiceSuggestionMessage_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "ServiceSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContactMethod" ADD CONSTRAINT "ServiceContactMethod_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalUserNote" ADD CONSTRAINT "InternalUserNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalUserNote" ADD CONSTRAINT "InternalUserNote_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAttribute" ADD CONSTRAINT "ServiceAttribute_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAttribute" ADD CONSTRAINT "ServiceAttribute_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarmaTransaction" ADD CONSTRAINT "KarmaTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarmaTransaction" ADD CONSTRAINT "KarmaTransaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarmaTransaction" ADD CONSTRAINT "KarmaTransaction_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "ServiceSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationStep" ADD CONSTRAINT "VerificationStep_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVerificationRequest" ADD CONSTRAINT "ServiceVerificationRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVerificationRequest" ADD CONSTRAINT "ServiceVerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceUser" ADD CONSTRAINT "ServiceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceUser" ADD CONSTRAINT "ServiceUser_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_watchedComments" ADD CONSTRAINT "_watchedComments_A_fkey" FOREIGN KEY ("A") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_watchedComments" ADD CONSTRAINT "_watchedComments_B_fkey" FOREIGN KEY ("B") REFERENCES "NotificationPreferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_onEventCreatedForServices" ADD CONSTRAINT "_onEventCreatedForServices_A_fkey" FOREIGN KEY ("A") REFERENCES "NotificationPreferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_onEventCreatedForServices" ADD CONSTRAINT "_onEventCreatedForServices_B_fkey" FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_onRootCommentCreatedForServices" ADD CONSTRAINT "_onRootCommentCreatedForServices_A_fkey" FOREIGN KEY ("A") REFERENCES "NotificationPreferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_onRootCommentCreatedForServices" ADD CONSTRAINT "_onRootCommentCreatedForServices_B_fkey" FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_onVerificationChangeForServices" ADD CONSTRAINT "_onVerificationChangeForServices_A_fkey" FOREIGN KEY ("A") REFERENCES "NotificationPreferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_onVerificationChangeForServices" ADD CONSTRAINT "_onVerificationChangeForServices_B_fkey" FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AttributeToNotificationPreferenceOnServiceVerificationChangeFi" ADD CONSTRAINT "_AttributeToNotificationPreferenceOnServiceVerificationC_A_fkey" FOREIGN KEY ("A") REFERENCES "Attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AttributeToNotificationPreferenceOnServiceVerificationChangeFi" ADD CONSTRAINT "_AttributeToNotificationPreferenceOnServiceVerificationC_B_fkey" FOREIGN KEY ("B") REFERENCES "NotificationPreferenceOnServiceVerificationChangeFilterFilter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServiceToCategory" ADD CONSTRAINT "_ServiceToCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServiceToCategory" ADD CONSTRAINT "_ServiceToCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToNotificationPreferenceOnServiceVerificationChangeFil" ADD CONSTRAINT "_CategoryToNotificationPreferenceOnServiceVerificationCh_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryToNotificationPreferenceOnServiceVerificationChangeFil" ADD CONSTRAINT "_CategoryToNotificationPreferenceOnServiceVerificationCh_B_fkey" FOREIGN KEY ("B") REFERENCES "NotificationPreferenceOnServiceVerificationChangeFilterFilter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
