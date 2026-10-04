# SnapShare Scaling Plan

SnapShare lets users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions
- 10 million registered users; 10% active daily = **1,000,000 DAU**.
- Each active user uploads 1 photo and views 50 feed pages per day.
- Photo = 2 MB, thumbnail = 50 KB, metadata = 1 KB. Day = 86,400 s. Peak = 5x average.

## 2. Estimates
- **Uploads:** 1,000,000 / 86,400 = **about 12/s average, about 58/s peak**.
- **Feed views:** 50,000,000 / 86,400 = **about 580/s average, about 2,900/s peak**.
- **Storage per year:** originals 2 TB x 365 = 730 TB; thumbnails 50 GB x 365 = 18 TB; total **about 748 TB**. Metadata is only about 365 GB.

## 3. Read-heavy or write-heavy?
**Read-heavy**: 580 views/s vs 12 uploads/s is about **50 to 1**. So: make reads cheap (CDN, cache, read replica) and push slow write work (thumbnails) to a background queue.

## 4. Photos are not stored in the database
730 TB a year would make the database huge, slow and costly to back up, and serving 2 MB files would use up connections needed for queries. Photos go in **object storage** (like S3); the database keeps only a small metadata row with the file key.

## 5. Architecture diagram

    Users -> DNS -> CDN -> Load balancer -> App servers (x3, stateless)

    App servers --reads--> Cache (Redis) --miss--> Read replica
    App servers --writes--> Primary database --copies to--> Read replica
    App servers --photo files--> Object storage (originals + thumbnails)
    App servers --"make thumbnail" job--> Queue --> Thumbnail worker
    Thumbnail worker --reads original / saves thumbnail--> Object storage
    CDN <--serves photos and thumbnails-- Object storage

## 6. What each component does
- **CDN:** caches photos and thumbnails near users so most image requests never reach our servers.
- **Load balancer:** spreads requests over many app servers and skips servers that fail.
- **App servers:** run the login, upload and feed logic; being stateless, we simply add more.
- **Cache:** keeps hot feeds and metadata in memory so the database is queried far less.
- **Primary database:** stores users, follows and photo metadata reliably and handles all writes.
- **Read replica:** a live copy that answers reads so the 50-to-1 read load doesn't slow writes.
- **Object storage:** stores the huge set of photo files cheaply and durably, outside the database.
- **Queue:** holds "make thumbnail" jobs so an upload finishes fast instead of waiting for image processing.
- **Thumbnail worker:** takes jobs from the queue and creates the 50 KB thumbnail, scaling separately from app servers.

## 7. Upload flow
1. The user taps Upload; the request goes to the **load balancer**, then an **app server**.
2. The app server checks login, file type and size.
3. It saves the original photo to **object storage** and gets a file key.
4. It writes a metadata row (user, caption, time, file key, status "processing") to the **primary database**.
5. It puts a "create thumbnail for photo X" job on the **queue**.
6. It replies "Upload successful" **immediately**, without waiting for the thumbnail.
7. A **worker** takes the job, downloads the original, makes the 50 KB thumbnail and saves it to object storage.
8. The worker sets the row to "ready" and clears related cache entries.
9. Followers now see the photo, with images served by the **CDN**. If a worker fails, the job stays in the queue and is retried.

## 8. Trade-offs
- **Replica lag vs freshness:** the replica copies data slightly after the primary, so an uploader may briefly not see their photo in the feed. We accept this eventual consistency for scale, and can read a user's own recent uploads from the primary.
- **Cache vs freshness:** the cache and CDN make feeds fast and cheap but can show slightly old data (such as a just-deleted photo). Shorter expiry is fresher but loads the database more.
- **Queue vs instant results:** uploads stay fast and thumbnails are retryable, but the thumbnail appears a few seconds later and workers must be monitored.
- **Cost vs speed:** a CDN and about 750 TB of storage a year are expensive, but serving images ourselves would cost more and be slower. Old photos can move to cheaper storage.