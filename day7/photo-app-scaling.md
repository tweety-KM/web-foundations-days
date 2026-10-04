# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

- 10 million registered users.
- 10% are active each day, so there are **1,000,000 daily active users (DAU)**.
- Each active user uploads 1 photo per day.
- Each active user views 50 feed pages per day (one request per page).
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail.
- One day has 86,400 seconds.
- Peak traffic is 5 times the average.
- Photo metadata (owner, caption, timestamp, file location) is about 1 KB per photo.

## 2. Estimates

### Uploads per second
- Uploads per day: 1,000,000 x 1 = 1,000,000
- Average: 1,000,000 / 86,400 = **about 12 uploads per second**
- Peak: 12 x 5 = **about 58 uploads per second**

### Feed views per second
- Feed views per day: 1,000,000 x 50 = 50,000,000
- Average: 50,000,000 / 86,400 = **about 580 views per second**
- Peak: 580 x 5 = **about 2,900 views per second**

### Storage per year
- Originals per day: 1,000,000 x 2 MB = 2 TB
- Thumbnails per day: 1,000,000 x 50 KB = 50 GB
- Total per day: about 2.05 TB
- Originals per year: 2 TB x 365 = **730 TB**
- Thumbnails per year: 50 GB x 365 = **about 18 TB**
- Total photo storage per year: **about 748 TB (roughly 0.75 PB)**
- Metadata per year: 365 million rows x 1 KB = about 365 GB, which is small next to the photos.

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are about 580 feed views per second but only about 12 uploads per second, a ratio of roughly **50 to 1**. Every photo is written once but viewed many times.

What this means for the design:
- Spend effort on making reads fast and cheap: a CDN, a cache and a database read replica.
- Writes are rarer but heavy (2 MB files), so they must not slow down the readers. Slow work such as thumbnails is moved to a background queue.
- Reads can be spread over many copies of the data, which is much easier to scale than writes.

## 4. Where should the photos be stored?

Photos should **not** be stored inside the database.
- At 730 TB a year, the database would become huge, slow and very expensive to back up and replicate.
- Databases are built for small structured rows, not large binary files.
- Serving 2 MB files from the database would use up the connections and memory that queries need.

Instead, photo files go in **object storage** (such as Amazon S3). It is cheap, almost unlimited and durable, and it works directly with a CDN. The database only stores a small row of metadata with the URL or key of each file.

## 5. Architecture diagram

```text
                          +-----------+
                          |   Users   |
                          | (phones,  |
                          |  browsers)|
                          +-----+-----+
                                |
                                v
                          +-----------+
                          |    CDN    |  <-- serves photos and thumbnails
                          +-----+-----+      (cached close to users)
                                |
                                v
                       +-----------------+
                       |  Load balancer  |
                       +--------+--------+
                                |
              +-----------------+-----------------+
              |                 |                 |
              v                 v                 v
        +-----------+     +-----------+     +-----------+
        | App server|     | App server|     | App server|
        +-----+-----+     +-----+-----+     +-----+-----+
              |                 |                 |
              +--------+--------+--------+--------+
                       |        |        |
          reads        |        |        |  writes / uploads
       +---------------+        |        +----------------+
       |                        |                         |
       v                        v                         v
  +---------+          +------------------+       +----------------+
  |  Cache  |          |     Database     |       | Object storage |
  | (Redis) |          |  Primary (writes)|       |  (photo files: |
  +---------+          |        |         |       |   originals +  |
                       |        v         |       |   thumbnails)  |
                       |  Read replica    |       +--------+-------+
                       |    (reads)       |                ^
                       +------------------+                |
                                                           |
              +--------------------+       +---------------+--+
              | Queue              | ----> | Thumbnail worker |
              | ("make thumbnail"  |       | (reads original, |
              |  jobs)             |       |  saves 50 KB     |
              +---------^----------+       |  thumbnail)      |
                        |                  +------------------+
                        |
               (app server adds a job
                after each upload)
```

## 6. What each component does

- **CDN:** it keeps copies of photos and thumbnails close to users, so most image requests are fast and never reach our servers.
- **Load balancer:** it spreads incoming requests across many app servers so no single server is overwhelmed, and it routes around servers that fail.
- **App servers:** they run the application logic (login, upload, feed), and because they are stateless we can add more whenever traffic grows.
- **Cache:** it holds frequently requested data, such as popular feeds and photo metadata, in memory so the database is asked far less often.
- **Database (primary):** it stores users, follows, comments and photo metadata reliably, and handles all the writes.
- **Read replica:** it is a live copy of the database that answers read queries, so the 50-to-1 read load does not slow down writes on the primary.
- **Object storage:** it stores the huge, growing set of photo files cheaply and durably, keeping them out of the database.
- **Queue:** it holds "make a thumbnail" jobs so the upload request can finish quickly instead of waiting for slow image processing.
- **Thumbnail worker:** it picks jobs off the queue, creates the 50 KB thumbnail and saves it, so image processing can scale separately from the app servers.

## 7. Upload flow, step by step

1. The user picks a photo in the app and taps Upload.
2. The request reaches the **load balancer**, which sends it to a free **app server**.
3. The app server checks that the user is logged in and that the file is valid (type and size).
4. The app server saves the original photo to **object storage** and gets back its file key.
5. The app server writes a metadata row (user, caption, timestamp, file key, status "processing") to the **primary database**.
6. The app server puts a "create thumbnail for photo X" job on the **queue**.
7. The app server replies to the user straight away with "Upload successful", without waiting for the thumbnail.
8. A **thumbnail worker** takes the job from the queue, downloads the original from object storage, resizes it to a 50 KB thumbnail and saves it back to object storage.
9. The worker updates the database row to status "ready" and clears the relevant cache entries.
10. Followers' feeds now show the new photo, with the thumbnail served by the **CDN**. If a worker fails, the job stays in the queue and is retried.

## 8. Trade-offs

- **Caching vs freshness:** a cache and the CDN make feeds fast and cheap, but they can show slightly old data, for example a deleted photo that lingers for a short time. Shorter cache times are fresher but put more load on the database.
- **Read replica vs consistency:** the replica takes read load off the primary, but it copies data a moment after the primary, so a user may upload a photo and briefly not see it in their own feed. We accept this small delay (eventual consistency) in return for scale.
- **Queue vs instant results:** the queue keeps uploads fast and lets thumbnails be retried, but the thumbnail appears a few seconds later, and we must run and monitor extra workers.
- **Cost vs speed:** a CDN and object storage at about 750 TB a year are not cheap, but serving images from our own servers would cost more and be slower. We could reduce cost by moving old photos to cheaper storage tiers.