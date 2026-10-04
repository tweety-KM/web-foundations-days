# School Database Design

## Tables

- **students**: one row per student. Columns: `id` (primary key), `name` and `email` (unique, so two students cannot share an email address).
- **courses**: one row per course. Columns: `id` (primary key), `title` and `teacher`.
- **enrolments**: one row for each time a student joins a course. Columns: `student_id` and `course_id` (both foreign keys), `grade` and `enrolled_on`. Its primary key is the pair `(student_id, course_id)`, so a student cannot be enrolled on the same course twice.

## Relationships

- **One-to-many:** one student has many enrolments, and one course has many enrolments. Each enrolment row belongs to exactly one student and exactly one course. This is stored with the foreign keys `student_id` and `course_id`.
- **Many-to-many (students and courses):** a student can take many courses, and a course has many students.
- **Why a join table is needed:** a single `course_id` column in `students` would only allow one course per student, and a list of student ids in one column would be hard to search, update and keep consistent. The `enrolments` table solves this by storing one row per student-course pair. It is also the natural home for the grade, because a grade belongs to the pair and not to the student or the course alone.

## Index

I would add an index on `enrolments(course_id)`:

    CREATE INDEX idx_enrolments_course ON enrolments (course_id);

The primary key `(student_id, course_id)` already makes it fast to find a student's courses. Finding all the students on a course searches by `course_id` alone, which the primary key does not help with, so the database would scan every row. This index speeds up that query and the student count per course. The cost is slightly slower inserts and a little extra storage, which is acceptable for a read-heavy school system.

## SQL or NoSQL?

I would choose SQL (a relational database). School data is highly structured and full of relationships between students, courses and grades. A relational database enforces that structure with foreign keys, unique emails and the rule against double enrolment, so bad data is rejected before it is stored. It also handles questions that cross tables, such as how many students are in each course, with a single query. NoSQL would suit data that is flexible or changes shape often, but here every record looks the same and consistency matters more than flexibility.