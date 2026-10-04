-- School database: students, courses and enrolments
PRAGMA foreign_keys = ON;

-- Remove old tables so the script can be re-run (children first)
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ---------- Tables ----------
CREATE TABLE students (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  email  TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  id       INTEGER PRIMARY KEY,
  title    TEXT NOT NULL,
  teacher  TEXT NOT NULL
);

CREATE TABLE enrolments (
  student_id   INTEGER NOT NULL,
  course_id    INTEGER NOT NULL,
  grade        INTEGER CHECK (grade BETWEEN 0 AND 100),
  enrolled_on  TEXT NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (student_id, course_id),  -- same student cannot join the same course twice
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);

-- ---------- Sample data ----------
INSERT INTO students (id, name, email) VALUES
  (1, 'Amina',    'amina@school.test'),
  (2, 'Ben',      'ben@school.test'),
  (3, 'Chloe',    'chloe@school.test'),
  (4, 'Dumisani', 'dumisani@school.test');

INSERT INTO courses (id, title, teacher) VALUES
  (1, 'Web Foundations', 'Ms Khumalo'),
  (2, 'Databases',       'Mr Naidoo'),
  (3, 'Cloud Computing', 'Ms Jacobs');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 72),
  (2, 1, 64),
  (2, 3, NULL),   -- no grade yet
  (3, 2, 91);

-- ---------- Queries ----------

-- Query 1: all courses for one student (by name)
SELECT courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses    ON courses.id = enrolments.course_id
WHERE students.name = 'Amina';

-- Query 2: all students on one course
SELECT students.name, students.email
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students   ON students.id = enrolments.student_id
WHERE courses.title = 'Databases';

-- Query 3: number of students per course
SELECT courses.title, COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id;

-- Query 4: students who have no enrolments
SELECT students.name
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.student_id IS NULL;

-- Query 5: update one enrolment's grade (Ben, Cloud Computing)
UPDATE enrolments
SET grade = 88
WHERE student_id = (SELECT id FROM students WHERE name = 'Ben')
  AND course_id  = (SELECT id FROM courses  WHERE title = 'Cloud Computing');

-- Check the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.id = enrolments.student_id
JOIN courses  ON courses.id = enrolments.course_id
WHERE students.name = 'Ben';