// Plain TypeScript types mirroring the database schema (no ORM dependency)
export type UserRole = 'USER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DELETED';
export type VideoStatus = 'DRAFT' | 'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'PUBLISHED' | 'FAILED';
export type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
export type SubscriptionStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type JobState = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type AdEventType = 'REQUEST' | 'IMPRESSION' | 'START' | 'COMPLETE' | 'ERROR';
export type VideoEventType = 'START' | 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'COMPLETE' | 'ERROR' | 'QUALITY_CHANGE';
export type ContentType = 'MOVIE' | 'EPISODE';
