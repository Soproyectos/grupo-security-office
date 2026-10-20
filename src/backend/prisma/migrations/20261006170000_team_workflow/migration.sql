CREATE TABLE "team_activities" (
 "id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "startsAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "assigneeId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "creatorId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3)
);
CREATE INDEX "team_activities_assigneeId_startsAt_idx" ON "team_activities"("assigneeId", "startsAt");
CREATE TABLE "team_requests" (
 "id" TEXT NOT NULL PRIMARY KEY, "kind" TEXT NOT NULL, "detail" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "creatorId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "reviewerId" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "response" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewedAt" TIMESTAMP(3)
);
CREATE INDEX "team_requests_creatorId_createdAt_idx" ON "team_requests"("creatorId", "createdAt");
CREATE INDEX "team_requests_status_createdAt_idx" ON "team_requests"("status", "createdAt");
